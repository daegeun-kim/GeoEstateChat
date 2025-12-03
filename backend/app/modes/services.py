from ..llm.llm_router import select_mode, build_analyze_plan
from ..llm.llm_client import call_llm
from ..db import get_data_analyze
from ..llm.llm_explain import llm_explain
import traceback
import json


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

    return {
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


def run(query: str):
    try:
        messages = select_mode(query)
        mode_json, usage_mode, mode_error = call_llm(messages)

        if mode_error or not mode_json:
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
                "usage": usage_mode,
                "error": mode_error or "LLM_MODE_ERROR",
            }

        mode = mode_json.get("mode")

        if mode == "analyze":
            result = run_analyze(query)
        else:
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
                "usage": usage_mode,
                "error": f"mode '{mode}' not implemented",
            }

        result["mode"] = mode
        result["mode_usage"] = usage_mode
        return result

    except Exception as e:
        traceback.print_exc()
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
            "usage": None,
            "error": f"internal server error: {e}",
        }
