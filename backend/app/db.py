import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
import geopandas as gpd

load_dotenv(dotenv_path="../.env")

DB_URL = os.getenv("db_url")
engine = create_engine(DB_URL)

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
        sql_b = f"SELECT {column_b}, borocode, geom FROM buildings WHERE large_n = '{neighborhood}'"
        sql_s = f"SELECT {column_s}, borocode, geom FROM street_block"
        print("DEBUG sql:", sql_b)
        gdf_b = gpd.read_postgis(sql_b, con=engine, geom_col="geom")
        gdf_s = gpd.read_postgis(sql_s, con=engine, geom_col="geom")
        
        borocode = int(gdf_b["borocode"].iloc[0])
        gdf_s_boro = gdf_s[gdf_s["borocode"] == borocode]
        print("data retrieved from db")
        return {
            "gdf_b": gdf_b, 
            "gdf_s": gdf_s,
            "gdf_s_boro": gdf_s_boro,
            "error": None
        }
    except Exception as e:
        print("DEBUG sql:", sql_b, sql_s)
        print("failed to retrieve data:", e)
        return {
            "gdf_b": None,
            "gdf_s": None,
            "error": str(e)
        }