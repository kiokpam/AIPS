#!/usr/bin/env python3
"""
Performance Metrics Collection Script
Collects comprehensive system performance metrics for reporting

Usage:
    python scripts/collect_performance_metrics.py [--output output.json] [--duration 60] [--interval 5]

This script collects:
- System performance (CPU, Memory, GPU, Disk)
- Camera statistics (FPS, frame counts, people counts)
- AI service metrics (inference times, processing rates)
- System health and alerts
"""

import os
import sys
import json
import time
import argparse
import requests
from datetime import datetime
from typing import Dict, List, Any
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

class MetricsCollector:
    def __init__(self, base_url: str = "http://localhost:8000", auth_token: str = None):
        self.base_url = base_url.rstrip('/')
        self.api_url = f"{self.base_url}/api"
        self.auth_token = auth_token
        self.session = requests.Session()
        
        if auth_token:
            self.session.headers.update({
                'Authorization': f'Bearer {auth_token}'
            })
    
    def get_auth_token(self, email: str, password: str) -> str:
        """Get authentication token"""
        try:
            response = requests.post(
                f"{self.api_url}/auth/login",
                json={"email": email, "password": password}
            )
            response.raise_for_status()
            data = response.json()
            return data.get('access_token')
        except Exception as e:
            print(f"⚠️  Authentication failed: {e}")
            print("Continuing without authentication (some endpoints may fail)")
            return None
    
    def collect_system_metrics(self) -> Dict[str, Any]:
        """Collect comprehensive system metrics"""
        try:
            response = self.session.get(f"{self.api_url}/system/metrics")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def collect_system_performance(self) -> Dict[str, Any]:
        """Collect current system performance"""
        try:
            response = self.session.get(f"{self.api_url}/system/performance")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def collect_performance_history(self, minutes: int = 60) -> Dict[str, Any]:
        """Collect performance history"""
        try:
            response = self.session.get(
                f"{self.api_url}/system/performance/history",
                params={"minutes": minutes}
            )
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def collect_camera_stats(self) -> List[Dict[str, Any]]:
        """Collect statistics for all cameras"""
        try:
            response = self.session.get(f"{self.api_url}/cameras")
            response.raise_for_status()
            cameras = response.json()
            
            stats = []
            for camera in cameras:
                try:
                    stat_response = self.session.get(
                        f"{self.api_url}/cameras/{camera['id']}/stats"
                    )
                    if stat_response.status_code == 200:
                        stats.append(stat_response.json())
                except Exception as e:
                    print(f"⚠️  Failed to get stats for camera {camera['id']}: {e}")
            
            return stats
        except Exception as e:
            return [{"error": str(e)}]
    
    def collect_system_summary(self) -> Dict[str, Any]:
        """Collect system statistics summary"""
        try:
            response = self.session.get(f"{self.api_url}/cameras/stats/summary")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def collect_system_health(self) -> Dict[str, Any]:
        """Collect system health status"""
        try:
            response = self.session.get(f"{self.api_url}/system/health")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def collect_device_info(self) -> Dict[str, Any]:
        """Collect GPU/device information"""
        try:
            response = self.session.get(f"{self.api_url}/system/gpu_info")
            response.raise_for_status()
            return response.json()
        except Exception as e:
            return {"error": str(e)}
    
    def collect_all_metrics(self) -> Dict[str, Any]:
        """Collect all available metrics"""
        print("📊 Collecting system metrics...")
        
        metrics = {
            "timestamp": datetime.now().isoformat(),
            "system_metrics": self.collect_system_metrics(),
            "system_performance": self.collect_system_performance(),
            "system_health": self.collect_system_health(),
            "system_summary": self.collect_system_summary(),
            "device_info": self.collect_device_info(),
            "camera_stats": self.collect_camera_stats(),
        }
        
        return metrics
    
    def collect_time_series(self, duration_minutes: int = 60, interval_seconds: int = 5) -> List[Dict[str, Any]]:
        """Collect metrics over time for time-series analysis"""
        print(f"📈 Collecting time-series data for {duration_minutes} minutes (interval: {interval_seconds}s)...")
        
        end_time = time.time() + (duration_minutes * 60)
        data_points = []
        
        while time.time() < end_time:
            point = {
                "timestamp": datetime.now().isoformat(),
                "system_performance": self.collect_system_performance(),
                "system_summary": self.collect_system_summary(),
            }
            data_points.append(point)
            
            if time.time() < end_time:
                time.sleep(interval_seconds)
        
        return data_points


def export_to_csv(metrics: Dict[str, Any], output_file: str):
    """Export metrics to CSV format"""
    import csv
    
    # Flatten metrics for CSV
    rows = []
    
    # System performance
    perf = metrics.get("system_performance", {})
    rows.append({
        "metric_type": "system_performance",
        "timestamp": perf.get("timestamp", ""),
        "cpu_usage": perf.get("cpu_usage", 0),
        "memory_usage": perf.get("memory_usage", 0),
        "gpu_usage": perf.get("gpu_usage", 0),
        "disk_usage": perf.get("disk_usage", 0),
    })
    
    # Camera stats
    for camera in metrics.get("camera_stats", []):
        rows.append({
            "metric_type": "camera",
            "camera_id": camera.get("camera_id", ""),
            "camera_name": camera.get("name", ""),
            "fps": camera.get("fps", 0),
            "frame_count": camera.get("frame_count", 0),
            "current_count": camera.get("current_count", 0),
            "running": camera.get("running", False),
        })
    
    # Write CSV
    if rows:
        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
        print(f"✅ Exported CSV to {output_file}")


def main():
    parser = argparse.ArgumentParser(description="Collect system performance metrics")
    parser.add_argument(
        "--url",
        default="http://localhost:8000",
        help="Backend API URL (default: http://localhost:8000)"
    )
    parser.add_argument(
        "--email",
        help="Login email (optional, for authenticated endpoints)"
    )
    parser.add_argument(
        "--password",
        help="Login password (optional)"
    )
    parser.add_argument(
        "--token",
        help="Authentication token (alternative to email/password)"
    )
    parser.add_argument(
        "--output",
        default="performance_metrics.json",
        help="Output file path (default: performance_metrics.json)"
    )
    parser.add_argument(
        "--format",
        choices=["json", "csv", "both"],
        default="json",
        help="Output format (default: json)"
    )
    parser.add_argument(
        "--duration",
        type=int,
        help="Collect time-series data for N minutes (optional)"
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=5,
        help="Interval in seconds for time-series collection (default: 5)"
    )
    
    args = parser.parse_args()
    
    # Initialize collector
    collector = MetricsCollector(base_url=args.url, auth_token=args.token)
    
    # Authenticate if credentials provided
    if args.email and args.password:
        token = collector.get_auth_token(args.email, args.password)
        if token:
            collector.auth_token = token
            collector.session.headers.update({
                'Authorization': f'Bearer {token}'
            })
    
    # Collect metrics
    if args.duration:
        # Time-series collection
        data = collector.collect_time_series(
            duration_minutes=args.duration,
            interval_seconds=args.interval
        )
        output = {
            "collection_type": "time_series",
            "duration_minutes": args.duration,
            "interval_seconds": args.interval,
            "data_points": data
        }
    else:
        # Single snapshot
        output = {
            "collection_type": "snapshot",
            "metrics": collector.collect_all_metrics()
        }
    
    # Save output
    if args.format in ["json", "both"]:
        json_file = args.output if args.output.endswith('.json') else f"{args.output}.json"
        with open(json_file, 'w') as f:
            json.dump(output, f, indent=2)
        print(f"✅ Exported JSON to {json_file}")
    
    if args.format in ["csv", "both"]:
        csv_file = args.output if args.output.endswith('.csv') else f"{args.output}.csv"
        if "metrics" in output:
            export_to_csv(output["metrics"], csv_file)
        else:
            print("⚠️  CSV export only available for snapshot collections")
    
    print("\n📊 Metrics collection complete!")
    print(f"   Output: {args.output}")
    if args.duration:
        print(f"   Collected {len(output['data_points'])} data points over {args.duration} minutes")


if __name__ == "__main__":
    main()

