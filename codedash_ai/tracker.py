# tracker.py
# Simple centroid-based tracker to give stable IDs across frames

import numpy as np
import math
from collections import OrderedDict

class CentroidTracker:
    def __init__(self, max_disappeared=30, max_distance=50):
        self.next_object_id = 0
        self.objects = OrderedDict()  # id -> centroid
        self.disappeared = OrderedDict()
        self.max_disappeared = max_disappeared
        self.max_distance = max_distance

    def register(self, centroid):
        self.objects[self.next_object_id] = centroid
        self.disappeared[self.next_object_id] = 0
        self.next_object_id += 1

    def deregister(self, object_id):
        del self.objects[object_id]
        del self.disappeared[object_id]

    def update(self, input_centroids):
        # input_centroids: list of (x,y)
        if len(input_centroids) == 0:
            # mark disappeared
            for oid in list(self.disappeared.keys()):
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self.deregister(oid)
            return self.objects

        if len(self.objects) == 0:
            for c in input_centroids:
                self.register(c)
            return self.objects

        # match by distance (greedy)
        object_ids = list(self.objects.keys())
        object_centroids = list(self.objects.values())

        D = np.zeros((len(object_centroids), len(input_centroids)), dtype=float)
        for i, oc in enumerate(object_centroids):
            for j, ic in enumerate(input_centroids):
                D[i, j] = math.hypot(oc[0]-ic[0], oc[1]-ic[1])

        # greedy assignment
        assigned_rows = set()
        assigned_cols = set()
        rows = D.min(axis=1).argsort()
        cols = D.argmin(axis=1)

        for row in rows:
            col = cols[row]
            if row in assigned_rows or col in assigned_cols:
                continue
            if D[row, col] > self.max_distance:
                continue
            oid = object_ids[row]
            self.objects[oid] = input_centroids[col]
            self.disappeared[oid] = 0
            assigned_rows.add(row)
            assigned_cols.add(col)

        # unassigned input -> register
        for j in range(len(input_centroids)):
            if j not in assigned_cols:
                self.register(input_centroids[j])

        # unassigned existing -> disappeared++
        for i in range(len(object_centroids)):
            if i not in assigned_rows:
                oid = object_ids[i]
                self.disappeared[oid] += 1
                if self.disappeared[oid] > self.max_disappeared:
                    self.deregister(oid)

        return self.objects
