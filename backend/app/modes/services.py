from ..llm.llm_router import select_mode, build_analyze_plan, build_search_plan, build_compare_plan
from ..llm.llm_client import call_llm
from ..db import get_data_analyze, get_data_search, get_data_search_final, get_data_compare
from ..llm.llm_explain import llm_explain
import traceback
import json
import pandas as pd

def create_summary(gdf, column: str):
    if gdf is None or column is None or column not in gdf.columns:
        return {
            "count": 0,
            "mean": None,
            "median": None,
            "min": None,
            "max": None,
        }

    s = gdf[column].dropna()

    if s.empty:
        return {
            "count": 0,
            "mean": None,
            "median": None,
            "min": None,
            "max": None,
        }

    count = int(s.count())
    mean = float(s.mean())
    median = float(s.median())
    min_val = float(s.min())
    max_val = float(s.max())

    return {
        "count": count,
        "mean": mean,
        "median": median,
        "min": min_val,
        "max": max_val,
    }    

def run_analyze(query: str):
    messages = build_analyze_plan(query)
    plan, usage, plan_error = call_llm(messages)

    if plan_error or not plan:
        return {
            "geojson": None,
            "column": None,
            "dtype": None,
            "scale": None,
            "region": None,
            "table": None,
            "filters": None,
            "summary": None,
            "explanation": None,
            "usage": usage,
            "error": plan_error or "LLM_PLAN_ERROR",
        }

    column = plan.get("column")
    dtype = plan.get("dtype")
    scale = plan.get("scale")
    region = plan.get("region")
    table = plan.get("table")
    filters = plan.get("filters") or []

    db_result = get_data_analyze(column=column, table=table, filters=filters)
    gdf = db_result["gdf"]
    db_error = db_result["error"]

    summary = create_summary(gdf=gdf, column=column)

    try:
        explanation = llm_explain(query=query, summary=summary)
    except Exception as e:
        print("llm_explain crashed:", e)
        traceback.print_exc()
        explanation = f"[llm_explain error: {e}]"

    if gdf is not None:
        geojson = json.loads(gdf.to_json())   # dict
    else:
        geojson = None

    print(usage)
    return {
        "mode": "analyze",
        "geojson": geojson, 
        "column": column, 
        "dtype": dtype,
        "scale": scale,
        "region": region, 
        "table": table, 
        "filters": filters,
        "summary": summary, 
        "explanation": explanation, 
        "usage": usage,  
        "error": db_error,   
    }



def run_search(query: str):
    messages = build_search_plan(query)
    plan, usage, plan_error = call_llm(messages)

    if plan_error or not plan:
        return {
            "geojson": None,
            "column": None,
            "summary": None,
            "analysis": None,
            "order": None,
            "explanation": None,
            "usage": usage,
            "error": plan_error or "LLM_PLAN_ERROR",
        }

    if isinstance(plan, str):
        try:
            plan = json.loads(plan)
        except Exception as e:
            return {
                "geojson": None,
                "column": None,
                "summary": None,
                "analysis": None,
                "order": None,
                "explanation": None,
                "usage": usage,
                "error": f"PLAN_JSON_ERROR: {e}",
            }

    column_s = plan.get("column_s")
    column_b = plan.get("column_b")
    dtype = plan.get("dtype")
    scale = plan.get("scale") or "large_n"
    analysis = plan.get("analysis")
    order = plan.get("order")

    if not column_s or not analysis:
        return {
            "geojson": None,
            "column_s": column_s,
            "summary": None,
            "analysis": analysis,
            "order": order,
            "explanation": None,
            "usage": usage,
            "error": "MISSING_PLAN_FIELDS",
        }

    db_result = get_data_search(column=column_s)
    gdf = db_result["gdf"]
    db_error = db_result["error"]

    if db_error or gdf is None or gdf.empty:
        return {
            "geojson": None,
            "column_s": column_s,
            "dtype": dtype,
            "scale": scale,
            "summary": None,
            "explanation": None,
            "usage": usage,
            "error": db_error or "NO_DATA",
        }

    if scale == "large_n":
        group_col = "large_n"
    elif scale == "borough":
        group_col = "borocode"
    else:
        group_col = "large_n"

    if analysis == "mean":
        agg_func = "mean"
    elif analysis == "median":
        agg_func = "median"
    elif analysis == "min":
        agg_func = "min"
    elif analysis == "max":
        agg_func = "max"
    else:
        agg_func = "mean"

    grouped = getattr(gdf.groupby(group_col, dropna=False)[column_s], agg_func)().reset_index(name="metric")

    if grouped.empty:
        return {
            "geojson": None,
            "column_s": column_s,
            "dtype": dtype,
            "scale": scale,
            "summary": None,
            "explanation": None,
            "usage": usage,
            "error": "NO_GROUPED_DATA",
        }

    if not order or order == "NO_MATCH":
        order = "descending"

    ascending = str(order).lower().startswith("asc")
    gdf_analyze = grouped.sort_values("metric", ascending=ascending)

    neighborhood = gdf_analyze.iloc[0][group_col]
    if scale=="borough":
        db_final = get_data_search_final(column=column_s, scale=scale, neighborhood=neighborhood)
    elif scale=="large_n":
        db_final = get_data_search_final(column=column_b, scale=scale, neighborhood=neighborhood)
    gdf_final = db_final["gdf"]
    db_final_error = db_final["error"]

    if db_final_error or gdf_final is None or gdf_final.empty:
        return {
            "geojson": None,
            "column": column_s if scale=="borough" else column_b, 
            "dtype": dtype,
            "scale": scale,
            "summary": None,
            "explanation": None,
            "usage": usage,
            "error": db_final_error or "NO_FINAL_DATA",
        }

    summary = create_summary(gdf=gdf_analyze, column="metric")

    try:
        explanation = llm_explain(query=query, summary=summary)
    except Exception as e:
        print("llm_explain crashed:", e)
        traceback.print_exc()
        explanation = f"[llm_explain error: {e}]"

    geojson = json.loads(gdf_final.to_json())

    print(usage)
    return {
        "mode": "search",
        "geojson": geojson,
        "column": column_s if scale=="borough" else column_b, 
        "dtype": dtype,
        "scale": scale,
        "region": None,
        "table": None,
        "filters": None,
        "summary": summary,
        "explanation": explanation,
        "usage": usage,
        "error": db_final_error,
    }




def run_compare(query: str):
    messages = build_compare_plan(query)
    plan, usage, plan_error = call_llm(messages)

    if plan_error or not plan:
        return {
            "mode": "compare",
            "geojson": [None, None],
            "column": None,
            "dtype": None,
            "scale": None,
            "region": [None, None],
            "table": None,
            "filters": None,
            "summary": [None, None],
            "explanation": [None, None],
            "usage": usage,
            "error": plan_error or "LLM_PLAN_ERROR",
        }

    column = plan.get("column")
    region1 = plan.get("region1")
    region2 = plan.get("region2")
    dtype = plan.get("dtype")
    scale = plan.get("scale")
    table = plan.get("table")
    filters = plan.get("filters") or []

    db_result = get_data_compare(
        column=column,
        scale=scale,
        table=table,
        region1=region1,
        region2=region2,
        filters=filters,
    )
    gdf = db_result["gdf"]
    db_error = db_result["error"]

    if db_error or gdf is None:
        return {
            "mode": "compare",
            "geojson": [None, None],
            "column": column,
            "dtype": dtype,
            "scale": scale,
            "region": [region1, region2],
            "table": table,
            "filters": filters,
            "summary": [None, None],
            "explanation": [None, None],
            "usage": usage,
            "error": db_error or "DB_ERROR",
        }

    if scale == "borough":
        gdf1 = gdf[gdf["borocode"] == region1]
        gdf2 = gdf[gdf["borocode"] == region2]
    elif scale == "large_n":
        gdf1 = gdf[gdf["large_n"] == region1]
        gdf2 = gdf[gdf["large_n"] == region2]
    else:
        return {
            "mode": "compare",
            "geojson": [None, None],
            "column": column,
            "dtype": dtype,
            "scale": scale,
            "region": [region1, region2],
            "table": table,
            "filters": filters,
            "summary": [None, None],
            "explanation": [None, None],
            "usage": usage,
            "error": f"INVALID_SCALE_{scale}",
        }

    summary1 = create_summary(gdf=gdf1, column=column)
    summary2 = create_summary(gdf=gdf2, column=column)

    try:
        explanation1 = llm_explain(query=query, summary=summary1)
        explanation2 = llm_explain(query=query, summary=summary2)
    except Exception as e:
        print("llm_explain crashed:", e)
        traceback.print_exc()
        explanation1 = f"[llm_explain error: {e}]"
        explanation2 = f"[llm_explain error: {e}]"

    geojson0 = json.loads(gdf.to_json()) if gdf is not None else None
    geojson1 = json.loads(gdf1.to_json()) if gdf1 is not None else None
    geojson2 = json.loads(gdf2.to_json()) if gdf2 is not None else None

    print(usage)
    return {
        "mode": "compare",
        "geojson": [geojson0, geojson1, geojson2],
        "column": column,
        "dtype": dtype,
        "scale": scale,
        "region": [region1, region2],
        "table": table,
        "filters": filters,
        "summary": [summary1, summary2],
        "explanation": [explanation1, explanation2],
        "usage": usage,
        "error": db_error,
    }






def run(query: str):
    try:
        messages = select_mode(query)
        mode_json, usage_mode, mode_error = call_llm(messages)

        if mode_error or not mode_json:
            return {
                "mode": None,
                "geojson": None,
                "column": None,
                "dtype": None,
                "scale": None,
                "region": None,
                "table": None,
                "filters": None,
                "summary": None,
                "explanation": None,
                "usage": usage_mode,
                "error": mode_error or "LLM_MODE_ERROR",
            }

        mode = mode_json.get("mode")

        if mode == "analyze":
            result = run_analyze(query)
        elif mode == "search":
            result = run_search(query)
        elif mode == "compare":
            result = run_compare(query)
        else:
            return {
                "mode": None,
                "geojson": None,
                "column": None,
                "dtype": None,
                "scale": None,
                "region": None,
                "table": None,
                "filters": None,
                "summary": None,
                "explanation": None,
                "usage": usage_mode,
                "error": f"mode '{mode}' not implemented",
            }

        result["mode"] = mode
        result["mode_usage"] = usage_mode
        return result

    except Exception as e:
        traceback.print_exc()
        return {
            "mode": None,
            "geojson": None,
            "column": None,
            "dtype": None,
            "scale": None,
            "region": None,
            "table": None,
            "filters": None,
            "summary": None,
            "explanation": None,
            "usage": None,
            "error": f"internal server error: {e}",
        }
