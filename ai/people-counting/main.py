import random
import time
from datetime import datetime
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="People Counting AI Service", version="0.1.0")

class CounterUpdate(BaseModel):
    event: str = "counter_update"
    store_id: str
    zone_id: str
    value: int
    ts: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "people-counting"}

@app.post("/infer")
def infer():
    # Simulate people counting inference
    store_id = f"store_{random.randint(1, 3)}"
    zone_id = f"zone_{random.randint(1, 5)}"
    count = random.randint(0, 20)
    
    event = CounterUpdate(
        store_id=store_id,
        zone_id=zone_id,
        value=count,
        ts=datetime.now().isoformat()
    )
    
    return event.dict()

@app.get("/metrics")
def metrics():
    return {
        "inference_count": random.randint(100, 1000),
        "avg_processing_time_ms": random.uniform(50, 200),
        "gpu_utilization": random.uniform(0.3, 0.9)
    }
