import random
from datetime import datetime
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="Behavior Detection AI Service", version="0.1.0")

class AnomalyDetected(BaseModel):
    event: str = "anomaly_detected"
    store_id: str
    camera_id: str
    type: str
    severity: float
    clip_ref: str = None
    ts: str

@app.get("/health")
def health():
    return {"status": "ok", "service": "behavior-detection"}

@app.post("/infer")
def infer():
    # Simulate behavior detection inference
    store_id = f"store_{random.randint(1, 3)}"
    camera_id = f"camera_{random.randint(1, 10)}"
    
    anomaly_types = ["fighting", "theft", "loitering", "crowd_gathering", "falling"]
    anomaly_type = random.choice(anomaly_types)
    severity = random.uniform(0.3, 1.0)
    
    # Only return anomaly if severity > 0.7
    if severity > 0.7:
        event = AnomalyDetected(
            store_id=store_id,
            camera_id=camera_id,
            type=anomaly_type,
            severity=severity,
            clip_ref=f"clip_{random.randint(1000, 9999)}.mp4",
            ts=datetime.now().isoformat()
        )
        return event.dict()
    else:
        return {"event": "no_anomaly", "ts": datetime.now().isoformat()}

@app.get("/metrics")
def metrics():
    return {
        "inference_count": random.randint(50, 500),
        "avg_processing_time_ms": random.uniform(100, 500),
        "anomaly_detection_rate": random.uniform(0.05, 0.15),
        "gpu_utilization": random.uniform(0.4, 0.95)
    }
