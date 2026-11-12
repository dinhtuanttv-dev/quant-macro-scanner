"""STUB local cho "vnstock_ezchart" (13/11/2026).

LY DO: vnstock v4.0.4 khai bao phu thuoc BAT BUOC "vnstock_ezchart>=1.0.1",
nhung goi nay da bi go khoi PyPI (https://pypi.org/pypi/vnstock-ezchart/json
tra 404) nen moi lan Vercel build deu hong o buoc "uv lock".

PHAM VI: vnstock chi dung goi nay de VE BIEU DO (vnstock/common/viz.py), va
import nam trong try/except ImportError - thieu lop Chart thi vnstock tu dat
HAS_VNSTOCK_EZCHART = False va bo qua. Du an nay khong ve bieu do bang
vnstock (api/stock.py chi lay du lieu gia), nen stub de RONG co chu y:
khong dinh nghia Chart / mplot de vnstock di dung nhanh "khong co thu vien
bieu do".

KHI goi that quay lai PyPI: go dong tuong ung trong api/requirements.txt va
xoa thu muc api/_vendor/ezchart_stub/.
"""
