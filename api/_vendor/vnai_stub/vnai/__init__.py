"""
STUB THAY THE cho package "vnai" (Vnstock Analytics Interface) - KHONG
PHAI package that.

LY DO (2026-09-25, quan trong): "vnai" (dependency BAT BUOC cua
vnstock v4.x) da bi PyPI dua vao "Quarantine" TU 24/09/2026, cung
thoi diem voi chinh "vnstock" - toan bo he sinh thai package cua tac
gia nay khong the cai qua PyPI, VA "vnai" KHONG CO ma nguon GitHub
cong khai (da xac nhan qua PyPI support issue: "Source code
repositories URLs: none") - khong the "cai tu GitHub" nhu da lam voi
vnstock.

vnai THUC CHAT la thu vien TELEMETRY/ANALYTICS PHU TRO (theo mo ta
chinh thuc: "System resource management and performance optimization
toolkit... Analytics & Telemetry Pipeline... collecting, buffering,
and securely transmitting system analytics data") - KHONG PHAI logic
loi lay du lieu chung khoan that. Da doc TRUC TIEP source code
vnstock (tag v4.0.4, https://github.com/thinh-vu/vnstock) va xac
nhan CHINH XAC vnstock chi dung DUY NHAT 2 thu tu vnai:
  1. optimize_execution(category) - dung nhu decorator factory
     (@optimize_execution("UI") tren cac ham API cong khai).
  2. setup() - goi 1 lan luc khoi tao, DA BOC trong try/except (vnstock/
     __init__.py: "except Exception: _vnai_initialized = True" - vnstock
     TU NO da thiet ke AN TOAN du setup() loi/thieu, khong bao gio crash).

Stub nay CHI lam DUNG 2 dieu do (NO-OP, khong gui telemetry that,
khong ghi file gi) - KHONG anh huong logic LAY DU LIEU CHUNG KHOAN
THAT cua vnstock (cac ham ohlcv/quote/... hoan toan doc lap voi vnai).

KHI PyPI het quarantine (theo doi https://pypi.org/project/vnai/): co
the go bo file nay + thu muc api/_vendor/vnai_stub/, doi lai
api/requirements.txt sang "vnai>=x.x.x" that tu PyPI.
"""


def optimize_execution(category=None):
    def decorator(func):
        return func
    return decorator


def setup(*args, **kwargs):
    return None
