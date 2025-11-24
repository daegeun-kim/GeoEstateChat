import pandas as pd
from sqlalchemy import create_engine
from dotenv import load_dotenv
import os
import geopandas as gpd

load_dotenv(dotenv_path="../.env")

DB_URL = os.getenv("db_url")
engine = create_engine(DB_URL)

def get_data(column, neighborhood):
    if not column:
        print("no column found")
        return {
            "gdf": None,
            "error": "no appropriate column"
        }

    try:
        sql = f"SELECT {column}, geom FROM buildings WHERE large_n = '{neighborhood}'"
        print("DEBUG sql:", sql)
        gdf = gpd.read_postgis(sql, con=engine, geom_col="geom")
        print("data retrieved from db")
        return {
            "gdf": gdf,
            "error": None
        }
    except Exception as e:
        print("DEBUG sql:", sql)
        print("failed to retrieve data:", e)
        return {
            "gdf": None,
            "error": str(e)
        }