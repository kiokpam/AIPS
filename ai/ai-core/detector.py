# detector.py
# wrapper to run model and return list of detections in format:
# [{'id': None, 'class': int, 'conf': float, 'bbox': (x1,y1,x2,y2), 'center':(cx,cy)}...]

import numpy as np

def detect_frame(model, frame, classes=[0], conf_thresh=0.5):
    """
    model: ultralytics YOLO object
    frame: BGR numpy array
    returns: list of detections
    """
    results = model(frame, stream=False)  # get batch result
    dets = []
    # ultralytics returns a list (len 1) of results
    r = results[0]
    if r.boxes is None:
        return dets
    for box in r.boxes:
        cls = int(box.cls[0])
        conf = float(box.conf[0])
        if classes and cls not in classes:
            continue
        if conf < conf_thresh:
            continue
        xyxy = box.xyxy[0].cpu().numpy() if hasattr(box.xyxy[0], 'cpu') else np.array(box.xyxy[0])
        x1,y1,x2,y2 = map(int, xyxy)
        cx = int((x1+x2)/2)
        cy = int((y1+y2)/2)
        dets.append({'id': None, 'class': cls, 'conf': conf, 'bbox':(x1,y1,x2,y2), 'center':(cx,cy)})
    return dets
