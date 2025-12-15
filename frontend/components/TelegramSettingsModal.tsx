'use client';

import { useState } from 'react';
import { X, Send, CheckCircle } from 'lucide-react';
import { motion } from 'framer-motion';

interface TelegramSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function TelegramSettingsModal({ isOpen, onClose }: TelegramSettingsModalProps) {
    const [botToken, setBotToken] = useState('');
    const [chatId, setChatId] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [isTesting, setIsTesting] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    if (!isOpen) return null;

    const handleTest = async () => {
        if (!botToken || !chatId) {
            setTestResult({ success: false, message: 'Vui lòng nhập Bot Token và Chat ID' });
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/telegram/test', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                },
                credentials: 'include',
                body: JSON.stringify({ bot_token: botToken, chat_id: chatId }),
            });

            const data = await response.json();
            setTestResult({ success: data.success, message: data.message });
        } catch (error) {
            setTestResult({ success: false, message: 'Lỗi kết nối đến server' });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async () => {
        if (!botToken || !chatId) {
            setTestResult({ success: false, message: 'Vui lòng nhập đầy đủ thông tin' });
            return;
        }

        setIsSaving(true);

        try {
            const token = localStorage.getItem('auth_token');
            const response = await fetch('/api/telegram/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : '',
                },
                credentials: 'include',
                body: JSON.stringify({ bot_token: botToken, chat_id: chatId, enabled }),
            });

            if (response.ok) {
                setTestResult({ success: true, message: 'Đã lưu cài đặt thành công!' });
                setTimeout(() => {
                    onClose();
                }, 1500);
            } else {
                const data = await response.json();
                setTestResult({ success: false, message: data.detail || 'Lỗi khi lưu cài đặt' });
            }
        } catch (error) {
            setTestResult({ success: false, message: 'Lỗi kết nối đến server' });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-slate-800 rounded-xl border border-slate-700 shadow-2xl w-full max-w-md"
            >
                {/* Header */}
                <div className="sticky top-0 bg-slate-800 border-b border-slate-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-100 flex items-center gap-2">
                            <Send className="w-6 h-6 text-blue-400" />
                            Cài đặt Telegram
                        </h2>
                        <p className="text-slate-400 mt-1 text-sm">
                            Cấu hình thông báo qua Telegram
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                    {/* Bot Token */}
                    <div>
                        <label className="block mb-2 text-slate-300 font-medium">Bot Token</label>
                        <input
                            type="text"
                            value={botToken}
                            onChange={(e) => setBotToken(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            Lấy từ @BotFather trên Telegram
                        </p>
                    </div>

                    {/* Chat ID */}
                    <div>
                        <label className="block mb-2 text-slate-300 font-medium">Chat ID</label>
                        <input
                            type="text"
                            value={chatId}
                            onChange={(e) => setChatId(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="-1001234567890"
                        />
                        <p className="text-xs text-slate-500 mt-1">
                            ID của group/channel nhận thông báo
                        </p>
                    </div>

                    {/* Enable Toggle */}
                    <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700">
                        <div className="flex items-center justify-between">
                            <div>
                                <h3 className="text-slate-100 font-medium">Bật thông báo</h3>
                                <p className="text-sm text-slate-400 mt-1">
                                    Gửi cảnh báo qua Telegram
                                </p>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => setEnabled(e.target.checked)}
                                    className="sr-only peer"
                                />
                                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <div
                            className={`rounded-lg p-4 border ${testResult.success
                                ? 'bg-green-900/20 border-green-700/50 text-green-200'
                                : 'bg-red-900/30 border-red-700 text-red-200'
                                }`}
                        >
                            <div className="flex items-start gap-3">
                                {testResult.success && <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />}
                                <p className="text-sm">{testResult.message}</p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-700 rounded-b-xl flex gap-3">
                    <button
                        onClick={handleTest}
                        disabled={isTesting || !botToken || !chatId}
                        className="btn-outline btn-md flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isTesting ? 'Đang test...' : 'Test kết nối'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving || !botToken || !chatId}
                        className="btn-primary btn-md flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Đang lưu...' : 'Lưu'}
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
