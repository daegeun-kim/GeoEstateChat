from .llm_router import get_column_from_query
from .db import get_data
import json

def create_summary(df, column):
    return {
        "mean": df[column].mean(),
        "min": df[column].min(),
        "25th quantile": df[column].quantile(0.25),
        "median": df[column].median(),
        "75th quantile": df[column].quantile(0.75),
        "max": df[column].max()
    }


def run_analysis(query: str):
    llm_result = get_column_from_query(query)
    column = llm_result["column"]
    neighborhood = llm_result['neighborhood']
    usage = llm_result["usage"]

    data_result = get_data(column, neighborhood)
    gdf = data_result["gdf"]
    error = data_result["error"]

    if error is not None:
        print("error in getting data")
        return {
            "geojson": None,
            "summary": None,
            "tokens": usage,
            "error": error
        }

    summary = create_summary(gdf, column)
    geojson = json.loads(gdf.to_json())
    print("final success")
    return {
        "geojson": geojson,
        "summary": summary,
        "tokens": usage,
        "error": None
    }