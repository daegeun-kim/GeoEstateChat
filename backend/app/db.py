import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
import geopandas as gpd

load_dotenv(dotenv_path="../.env")

DB_URL = os.getenv("db_url")
engine = create_engine(DB_URL)

def get_data_analyze(column, table, filters):
    if not column:
        print("no column matched")
        return {"gdf": None, "error": "no appropriate column"}

    base_table = f"public.{table}"

    where_clauses = []
    params = {}

    if filters:
        for i, (col, op, val) in enumerate(filters):
            if val == "NO_MATCH":
                continue
            key = f"v{i}"
            where_clauses.append(f"{col} {op} %({key})s")
            params[key] = val

    where_sql = " AND ".join(where_clauses) if where_clauses else "TRUE"

    sql = f"SELECT {column}, geom FROM {base_table} WHERE {where_sql}"
    print("sql:", sql, "params:", params)

    try:
        gdf = gpd.read_postgis(sql, con=engine, geom_col="geom", params=params)
        print("data retrieved from db")
        return {"gdf": gdf, "error": None}
    except Exception as e:
        print("failed to retrieve data:", e)
        return {"gdf": None, "error": str(e)}








    
def get_data(column_b, column_s, neighborhood):
    if not column_b:
        print("no column_b found")
        return {
            "gdf_b": None,
            "error": "no appropriate column"
        }
    if not column_s:
        print("no column_s found")
        return {
            "gdf_s": None,
            "error": "no appropriate column"
        }

    try:
        sql = f"SELECT {column_b}, geom FROM buildings WHERE large_n = '{neighborhood}'"
        print("DEBUG sql:", sql)
        gdf = gpd.read_postgis(sql, con=engine, geom_col="geom")
        
        borocode = int(gdf["borocode"].iloc[0])
        gdf_s_boro = gdf[gdf["borocode"] == borocode]
        print("data retrieved from db")
        return {
            "gdf_b": gdf, 
            "gdf_s": gdf,
            "gdf_s_boro": gdf_s_boro,
            "error": None
        }
    except Exception as e:
        print("DEBUG sql:", sql, sql)
        print("failed to retrieve data:", e)
        return {
            "gdf_b": None,
            "gdf_s": None,
            "error": str(e)
        }