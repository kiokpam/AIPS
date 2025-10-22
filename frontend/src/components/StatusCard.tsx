import { ReactNode } from 'react';
import { CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

interface StatusCardProps {
  title: string;
  status: 'online' | 'offline' | 'warning' | 'error';
  description?: string;
  children?: ReactNode;
  className?: string;
}

const statusConfig = {
  online: {
    icon: CheckCircle,
    color: 'text-success-500',
    bgColor: 'bg-success-50',
    borderColor: 'border-success-200',
    textColor: 'text-success-700',
  },
  offline: {
    icon: XCircle,
    color: 'text-gray-500',
    bgColor: 'bg-gray-50',
    borderColor: 'border-gray-200',
    textColor: 'text-gray-700',
  },
  warning: {
    icon: AlertCircle,
    color: 'text-warning-500',
    bgColor: 'bg-warning-50',
    borderColor: 'border-warning-200',
    textColor: 'text-warning-700',
  },
  error: {
    icon: XCircle,
    color: 'text-danger-500',
    bgColor: 'bg-danger-50',
    borderColor: 'border-danger-200',
    textColor: 'text-danger-700',
  },
};

export default function StatusCard({ 
  title, 
  status, 
  description, 
  children, 
  className = '' 
}: StatusCardProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={`card ${config.bgColor} ${config.borderColor} ${className}`}>
      <div className="card-body">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Icon className={`h-5 w-5 ${config.color} mr-3`} />
            <div>
              <h3 className="text-sm font-medium text-gray-900">{title}</h3>
              {description && (
                <p className={`text-sm ${config.textColor}`}>{description}</p>
              )}
            </div>
          </div>
          <span className={`status-badge ${
            status === 'online' ? 'status-online' :
            status === 'warning' ? 'status-warning' :
            status === 'error' ? 'status-error' :
            'status-offline'
          }`}>
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
        {children && (
          <div className="mt-4">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
