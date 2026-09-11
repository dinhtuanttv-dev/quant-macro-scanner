"""
api/cluster/index.py — Vercel Python Serverless Function (FastAPI/ASGI).

Chay HDBSCAN THAT tren ma tran khoang cach DTW ĐÃ TÍNH SẴN ở TypeScript
(khong tinh lai DTW o day - tranh trung lap logic backend, dung dung
nguyen tac "khong viet trung logic da co" da thong nhat tu dau du an).

QUAN TRONG - requirements.txt RIENG BIET voi api/requirements.txt (dung
cho api/stock.py): file nay dat trong thu muc con api/cluster/, kem theo
1 requirements.txt RIENG cung thu muc - Vercel Python Runtime tu dong tim
requirements.txt GAN NHAT voi entrypoint (uu tien thu muc con truoc thu
muc cha). Muc dich: stock.py (chi can vnstock+pandas, nhe) KHONG bi anh
huong boi cac goi nang hon (numpy/scipy/scikit-learn/hdbscan) ma cluster
nay can - tranh lam cham/rui ro cho endpoint dang chay tot san.

DA XAC NHAN (khong doan mo): hdbscan 0.8.44 co san wheel binary
manylinux2014_x86_64 - khop kien truc Linux Vercel Python Runtime dung,
kha nang cao KHONG can bien dich tu ma nguon khi deploy. Da test that
logic clustering (3 nhom diem tach biet -> HDBSCAN nhan dung 3 cum) TRUOC
khi viet endpoint nay.
"""
import os

os.environ.setdefault("HOME", "/tmp")
os.environ.setdefault("XDG_CACHE_HOME", "/tmp/.cache")
os.environ.setdefault("XDG_CONFIG_HOME", "/tmp/.config")
os.makedirs("/tmp/.cache", exist_ok=True)
os.makedirs("/tmp/.config", exist_ok=True)

from typing import List

import numpy as np
import hdbscan
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# CORS: cho phep frontend (global-quanta, domain khac voi backend) goi
# truc tiep endpoint nay - giong cach cac route Next.js khac trong du an
# da mo CORS cho frontend goi qua VITE_API_BASE_URL.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["POST", "OPTIONS"],
    allow_headers=["*"],
)


class ClusterRequest(BaseModel):
    distanceMatrix: List[List[float]]
    minClusterSize: int = 3


class ClusterResponse(BaseModel):
    labels: List[int]
    probabilities: List[float]
    nClusters: int


@app.post("/api/cluster", response_model=ClusterResponse)
def cluster(req: ClusterRequest):
    n = len(req.distanceMatrix)
    if n == 0:
        raise HTTPException(status_code=400, detail="distanceMatrix rong.")
    if any(len(row) != n for row in req.distanceMatrix):
        raise HTTPException(status_code=400, detail="distanceMatrix phai la ma tran vuong (NxN).")

    # HDBSCAN can it nhat vai diem moi co y nghia thong ke - qua it thi tra
    # ve tat ca la "nhieu" (label -1) thay vi ep chay thuat toan tren du
    # lieu qua nho (de gay ket qua khong on dinh/vo nghia).
    if n < 4:
        return ClusterResponse(labels=[-1] * n, probabilities=[0.0] * n, nClusters=0)

    matrix = np.array(req.distanceMatrix, dtype=float)
    min_cluster_size = max(2, min(req.minClusterSize, n // 2))

    clusterer = hdbscan.HDBSCAN(metric="precomputed", min_cluster_size=min_cluster_size)
    labels = clusterer.fit_predict(matrix)
    probabilities = clusterer.probabilities_

    n_clusters = len(set(labels.tolist())) - (1 if -1 in labels else 0)

    return ClusterResponse(
        labels=[int(x) for x in labels],
        probabilities=[round(float(x), 4) for x in probabilities],
        nClusters=n_clusters,
    )
