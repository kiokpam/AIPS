import React from 'react';

export function SkeletonRect({ className = '', style = {} }: { className?: string, style?: React.CSSProperties }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-slate-700 rounded ${className}`}
      style={style}
    ></div>
  );
}

export function SkeletonText({ className = '', style = {}, width = '70%' }: { className?: string, style?: React.CSSProperties, width?: string }) {
  return (
    <div
      className={`animate-pulse bg-slate-200 dark:bg-slate-700 h-4 rounded ${className}`}
      style={{ width, ...style }}
    />
  );
}
