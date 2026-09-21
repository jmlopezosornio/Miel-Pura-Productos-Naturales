import streamlit as st
import pandas as pd
import os

st.set_page_config(page_title="Control de Stock y Ventas", layout="wide")

FILE_PATH = "MIel & Productos Naturales.xlsx"

# Cargar datos del Excel
@st.cache_data(ttl=1)
def load_data():
    if os.path.exists(FILE_PATH):
        xls = pd.ExcelFile(FILE_PATH)
        df_stock = pd.read_excel(xls, 'Stock').dropna(how='all')
        df_ventas = pd.read_excel(xls, 'Ventas').dropna(how='all')
        df_pagos = pd.read_excel(xls, 'Pagos').dropna(how='all')
        return df_stock, df_ventas, df_pagos
    else:
        st.error(f"No se encontró el archivo {FILE_PATH}")
        return pd.DataFrame(), pd.DataFrame(), pd.DataFrame()

df_stock, df_ventas, df_pagos = load_data()

st.title("🍯 Control de Stock, Ventas y Pagos")

# Menú lateral
opcion = st.sidebar.selectbox("Selecciona una sección", ["Stock Actual", "Registrar Venta", "Historial de Ventas", "Pagos"])

if opcion == "Stock Actual":
    st.header("📦 Inventario Disponible")
    if not df_stock.empty:
        st.dataframe(df_stock, use_container_width=True)
    else:
        st.info("No hay datos de stock.")

elif opcion == "Registrar Venta":
    st.header("🛒 Registrar Nueva Venta")
    
    with st.form("form_venta"):
        producto = st.selectbox("Producto", df_stock["Unnamed: 2"].dropna().unique() if not df_stock.empty else ["Miel 1kg", "Almendras", "Nueces"])
        unidades = st.number_input("Cantidad de unidades", min_value=1, step=1)
        precio_unitario = st.number_input("Precio por unidad ($)", min_value=0, step=500)
        forma_pago = st.selectbox("Forma de Pago", ["Efectivo", "Transferencia", "Otro"])
        
        submitted = st.form_submit_button("Guardar Venta")
        
        if submitted:
            st.success(f"Venta registrada: {unidades}x {producto} - Total: ${unidades * precio_unitario}")

elif opcion == "Historial de Ventas":
    st.header("📊 Registro de Ventas")
    if not df_ventas.empty:
        st.dataframe(df_ventas, use_container_width=True)

elif opcion == "Pagos":
    st.header("💳 Control de Pagos y Saldos")
    if not df_pagos.empty:
        st.dataframe(df_pagos, use_container_width=True)