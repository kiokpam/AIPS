"""
System Monitoring Service
Provides system health, performance, and device information
"""

import os
import time
import psutil
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime, timedelta
import torch

class SystemMonitor:
    """System monitoring service for health and performance tracking"""
    
    def __init__(self):
        self.start_time = time.time()
        
        # Performance tracking
        self.performance_history = []
        self.max_history = 100  # Keep last 100 measurements
    
    def get_device_info(self) -> Dict[str, Any]:
        """Get GPU/CPU device information (from codedash_ai/models.py)"""
        try:
            info = {
                'cuda_available': torch.cuda.is_available(),
                'device_count': torch.cuda.device_count() if torch.cuda.is_available() else 0,
                'current_device': torch.cuda.current_device() if torch.cuda.is_available() else None,
                'device_name': torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU"
            }
            
            # Add additional GPU info if available
            if torch.cuda.is_available():
                info.update({
                    'gpu_memory_total': torch.cuda.get_device_properties(0).total_memory,
                    'gpu_memory_allocated': torch.cuda.memory_allocated(0),
                    'gpu_memory_cached': torch.cuda.memory_reserved(0),
                    'gpu_utilization': self._get_gpu_utilization()
                })
            
            return info
        except Exception as e:
            return {
                'cuda_available': False,
                'device_count': 0,
                'current_device': None,
                'device_name': "CPU",
                'error': str(e)
            }
    
    def _get_gpu_utilization(self) -> float:
        """Get GPU utilization percentage"""
        try:
            # Try to get GPU utilization using nvidia-ml-py if available
            import pynvml
            pynvml.nvmlInit()
            handle = pynvml.nvmlDeviceGetHandleByIndex(0)
            utilization = pynvml.nvmlDeviceGetUtilizationRates(handle)
            return utilization.gpu / 100.0
        except ImportError:
            # Fallback: estimate based on memory usage
            if torch.cuda.is_available():
                allocated = torch.cuda.memory_allocated(0)
                total = torch.cuda.get_device_properties(0).total_memory
                return min(allocated / total, 1.0)
        except Exception:
            pass
        return 0.0
    
    def get_system_performance(self) -> Dict[str, Any]:
        """Get system performance metrics"""
        try:
            # CPU and Memory
            cpu_percent = psutil.cpu_percent(interval=1)
            memory = psutil.virtual_memory()
            disk = psutil.disk_usage('/')
            
            # Network (if available)
            network = None
            try:
                network_io = psutil.net_io_counters()
                network = {
                    'bytes_sent': network_io.bytes_sent,
                    'bytes_recv': network_io.bytes_recv,
                    'packets_sent': network_io.packets_sent,
                    'packets_recv': network_io.packets_recv
                }
            except Exception:
                pass
            
            # Process information
            process = psutil.Process()
            process_info = {
                'cpu_percent': process.cpu_percent(),
                'memory_percent': process.memory_percent(),
                'memory_mb': process.memory_info().rss / 1024 / 1024,
                'num_threads': process.num_threads(),
                'create_time': process.create_time()
            }
            
            performance_data = {
                'timestamp': datetime.now().isoformat(),
                'cpu_usage': cpu_percent / 100.0,
                'memory_usage': memory.percent / 100.0,
                'memory_available_gb': memory.available / 1024 / 1024 / 1024,
                'memory_total_gb': memory.total / 1024 / 1024 / 1024,
                'disk_usage': disk.percent / 100.0,
                'disk_free_gb': disk.free / 1024 / 1024 / 1024,
                'disk_total_gb': disk.total / 1024 / 1024 / 1024,
                'network': network,
                'process': process_info,
                'system_uptime': time.time() - self.start_time
            }
            
            # Add GPU info if available
            device_info = self.get_device_info()
            if device_info.get('cuda_available'):
                performance_data['gpu_usage'] = device_info.get('gpu_utilization', 0.0)
                performance_data['gpu_memory_usage'] = (
                    device_info.get('gpu_memory_allocated', 0) / 
                    device_info.get('gpu_memory_total', 1)
                )
            
            # Store in history
            self.performance_history.append(performance_data)
            if len(self.performance_history) > self.max_history:
                self.performance_history = self.performance_history[-self.max_history:]
            
            return performance_data
            
        except Exception as e:
            return {
                'timestamp': datetime.now().isoformat(),
                'error': str(e),
                'system_uptime': time.time() - self.start_time
            }
    
    async def get_ai_service_health(self) -> Dict[str, Any]:
        """Get health status of AI services - placeholder for future AI service integration"""
        # AI engineers can extend this method to check their service health
        return {}
    
    async def get_ai_service_metrics(self) -> Dict[str, Any]:
        """Get metrics from AI services - placeholder for future AI service integration"""
        # AI engineers can extend this method to get metrics from their services
        return {}
    
    def get_performance_history(self, minutes: int = 60) -> Dict[str, Any]:
        """Get performance history for the last N minutes"""
        cutoff_time = time.time() - (minutes * 60)
        
        filtered_history = [
            entry for entry in self.performance_history
            if datetime.fromisoformat(entry['timestamp']).timestamp() > cutoff_time
        ]
        
        if not filtered_history:
            return {'history': [], 'summary': {}}
        
        # Calculate summary statistics
        cpu_values = [entry.get('cpu_usage', 0) for entry in filtered_history]
        memory_values = [entry.get('memory_usage', 0) for entry in filtered_history]
        
        summary = {
            'avg_cpu_usage': sum(cpu_values) / len(cpu_values) if cpu_values else 0,
            'max_cpu_usage': max(cpu_values) if cpu_values else 0,
            'avg_memory_usage': sum(memory_values) / len(memory_values) if memory_values else 0,
            'max_memory_usage': max(memory_values) if memory_values else 0,
            'data_points': len(filtered_history),
            'time_range_minutes': minutes
        }
        
        return {
            'history': filtered_history,
            'summary': summary
        }

# Global system monitor instance
system_monitor = SystemMonitor()
