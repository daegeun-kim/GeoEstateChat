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
            "p10": None,
            "p90": None,
        }

    count = int(s.count())
    mean = float(s.mean())
    median = float(s.median())
    min_val = float(s.min())
    max_val = float(s.max())
    p10 = float(s.quantile(0.1))
    p90 = float(s.quantile(0.9))

    return {
        "count": count,
        "mean": mean,
        "median": median,
        "min": min_val,
        "max": max_val,
        "p10": p10,
        "p90": p90,
    }

def run_analysis(query: str):
    import traceback

    try:
        llm_result = get_column_from_query(query)
        column = llm_result["column"]
        neighborhood = llm_result.get("neighborhood")
        usage = llm_result.get("usage")

        data_result = get_data(column, neighborhood)
        gdf = data_result["gdf"]
        error = data_result["error"]

        if error is not None:
            print("error in get_data:", error)
            return {
                "geojson": None,
                "summary": None,
                "explanation": None,
                "tokens": usage,
                "error": error,
            }

        summary = create_summary(gdf, column)
        geojson = json.loads(gdf.to_json())

        try:
            explanation = llm_explain(
                query=query,
                column=column,
                neighborhood=neighborhood,
                summary=summary,
            )
        except Exception as e:
            print("llm_explain crashed:", e)
            traceback.print_exc()
            explanation = f"[llm_explain error: {e}]"

        return {
            "geojson": geojson,
            "summary": summary,
            "explanation": explanation,
            "tokens": usage,
            "error": None,
        }

    except Exception as e:
        import traceback
        print("run_analysis crashed:", e)
        traceback.print_exc()
        return {
            "geojson": None,
            "summary": None,
            "explanation": None,
            "tokens": None,
            "error": f"internal server error: {e}",
        }
