from .llm_router import get_column_from_query
from .db import get_data
from .llm_explain import llm_explain
import json

def create_summary(gdf, column: str):
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

def run_analysis(query: str):
    import traceback

    try:
        llm_result = get_column_from_query(query)
        column_b = llm_result["column_b"]
        column_s = llm_result["column_s"]
        neighborhood = llm_result.get("neighborhood")
        usage = llm_result.get("usage")

        data_result = get_data(column_b, column_s, neighborhood)
        gdf_b = data_result["gdf_b"]
        gdf_s = data_result["gdf_s"]
        gdf_s_boro = data_result["gdf_s_boro"]
        error = data_result["error"]

        if error is not None:
            print("error in get_data:", error)
            return {
                "geojson_b": None,
                "geojson_s": None,
                "summary_b": None,
                "summary_s": None,
                "explanation": None,
                "tokens": usage,
                "error": error,
            }

        summary_b = create_summary(gdf_b, column_b)
        summary_s = create_summary(gdf_s, column_s)
        summary_s_boro = create_summary(gdf_s_boro, column_s)
        geojson_b = json.loads(gdf_b.to_json())
        geojson_s = json.loads(gdf_s.to_json())
        geojson_s_boro = json.loads(gdf_s_boro.to_json())

        try:
            explanation_b = llm_explain(
                query=query,
                column=column_b,
                neighborhood=neighborhood,
                summary=summary_b,
            )
            explanation_s = llm_explain(
                query=query,
                column=column_s,
                neighborhood=neighborhood,
                summary=summary_s,
            )
            explanation_s_boro = llm_explain(
                query=query,
                column=column_s,
                neighborhood=neighborhood,
                summary=summary_s_boro,
            )
        except Exception as e:
            print("llm_explain crashed:", e)
            traceback.print_exc()
            explanation_b = f"[llm_explain error: {e}]"
            explanation_s = f"[llm_explain error: {e}]"

        return {
            "geojson_b": geojson_b,
            "geojson_s": geojson_s,
            "geojson_s_boro": geojson_s_boro,
            "summary_b": summary_b,
            "summary_s": summary_s,
            "summary_s_boro": summary_s_boro,
            "explanation_b": explanation_b,
            "explanation_s": explanation_s,
            "explanation_s_boro": explanation_s_boro,
            "tokens": usage,
            "error": None,
        }

    except Exception as e:
        import traceback
        print("run_analysis crashed:", e)
        traceback.print_exc()
        return {
            "geojson_b": None,
            "geojson_s": None,
            "summary_b": None,
            "summary_s": None,
            "explanation_b": None,
            "explanation_s": None,
            "tokens": None,
            "error": f"internal server error: {e}",
        }
