'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Bug,
  ChevronRight,
  Info,
  Search,
  Terminal,
} from 'lucide-react';

// 日志级别类型
type LogLevel = 'error' | 'warn' | 'info' | 'debug';

// 日志来源类型
type LogSource = 'api' | 'web' | 'mobile' | 'cron';

// 日志条目接口
interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  title: string;
  source: LogSource;
  requestId: string;
  userId: string;
  content: string;
  stackTrace?: string;
}

// 生成 Mock 日志数据
function generateMockLogs(): LogEntry[] {
  const levels: LogLevel[] = ['error', 'warn', 'info', 'debug'];
  const sources: LogSource[] = ['api', 'web', 'mobile', 'cron'];

  const logTemplates = [
    { level: 'error' as LogLevel, title: '数据库连接超时', content: '无法连接到主数据库服务器，连接池已满', hasStack: true },
    { level: 'error' as LogLevel, title: '用户认证失败', content: 'JWT Token 验证失败，token 已过期', hasStack: false },
    { level: 'error' as LogLevel, title: 'API 请求异常', content: '第三方服务返回 500 错误', hasStack: true },
    { level: 'error' as LogLevel, title: '文件上传失败', content: '文件大小超出限制', hasStack: false },
    { level: 'warn' as LogLevel, title: '接口响应缓慢', content: '接口响应时间超过 2 秒阈值', hasStack: false },
    { level: 'warn' as LogLevel, title: '内存使用率偏高', content: 'JVM 堆内存使用率达到 85%', hasStack: false },
    { level: 'warn' as LogLevel, title: '重复请求检测', content: '检测到同一用户短时间内重复提交', hasStack: false },
    { level: 'warn' as LogLevel, title: '缓存命中率下降', content: 'Redis 缓存命中率降至 60% 以下', hasStack: false },
    { level: 'info' as LogLevel, title: '用户登录成功', content: '用户通过邮箱密码登录成功', hasStack: false },
    { level: 'info' as LogLevel, title: '数据同步完成', content: '定时数据同步任务执行成功', hasStack: false },
    { level: 'info' as LogLevel, title: '订单创建成功', content: '新订单已创建并支付成功', hasStack: false },
    { level: 'info' as LogLevel, title: '配置已更新', content: '系统配置已成功更新', hasStack: false },
    { level: 'info' as LogLevel, title: '文件处理完成', content: '批量文件导入处理完成', hasStack: false },
    { level: 'debug' as LogLevel, title: 'SQL 查询执行', content: '执行 SQL 查询，耗时 120ms', hasStack: false },
    { level: 'debug' as LogLevel, title: '缓存操作', content: '从 Redis 缓存读取数据', hasStack: false },
    { level: 'debug' as LogLevel, title: '请求参数校验', content: '请求参数校验通过', hasStack: false },
    { level: 'debug' as LogLevel, title: '方法调用追踪', content: '进入用户服务方法', hasStack: false },
  ];

  const stackTraces = [
    `java.sql.SQLTimeoutException: Connection timeout
    at com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:223)
    at com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:188)
    at com.zaxxer.hikari.HikariDataSource.getConnection(HikariDataSource.java:100)
    at com.example.dao.UserDao.findById(UserDao.java:45)
    at com.example.service.UserService.getUserById(UserService.java:23)`,
    `java.lang.RuntimeException: External service error
    at com.example.integration.PaymentClient.charge(PaymentClient.java:78)
    at com.example.service.OrderService.createOrder(OrderService.java:56)
    at com.example.controller.OrderController.create(OrderController.java:34)
    at sun.reflect.NativeMethodAccessorImpl.invoke0(Native Method)`,
  ];

  const userIds = ['user_001', 'user_002', 'user_003', 'user_demo', 'user_10086'];
  const logs: LogEntry[] = [];
  const now = new Date();

  for (let i = 0; i < 25; i++) {
    const template = logTemplates[i % logTemplates.length];
    const source = sources[i % sources.length];
    const userId = userIds[i % userIds.length];
    const date = new Date(now.getTime() - i * 3600 * 1000 - Math.random() * 1800 * 1000);

    logs.push({
      id: `log_${String(i + 1).padStart(4, '0')}`,
      timestamp: date.toISOString(),
      level: template.level,
      title: template.title,
      source: source,
      requestId: `req_${Math.random().toString(36).substring(2, 10)}`,
      userId: userId,
      content: template.content,
      stackTrace: template.hasStack ? stackTraces[i % stackTraces.length] : undefined,
    });
  }

  return logs;
}

// 日志级别显示配置
const levelConfig: Record<LogLevel, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  error: {
    label: '错误',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    icon: <AlertCircle className="h-4 w-4" />,
  },
  warn: {
    label: '警告',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10 border-yellow-500/20',
    icon: <AlertTriangle className="h-4 w-4" />,
  },
  info: {
    label: '信息',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    icon: <Info className="h-4 w-4" />,
  },
  debug: {
    label: '调试',
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
    icon: <Bug className="h-4 w-4" />,
  },
};

// 日志来源显示配置
const sourceLabels: Record<LogSource, string> = {
  api: 'API 服务',
  web: 'Web 前端',
  mobile: '移动端',
  cron: '定时任务',
};

export default function LogViewerPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center">
        <p className="text-slate-400">加载中...</p>
      </div>
    }>
      <LogViewerContent />
    </Suspense>
  );
}

function LogViewerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 搜索条件
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 筛选条件
  const [selectedLevel, setSelectedLevel] = useState<LogLevel | 'all'>('all');

  // 当前选中的日志
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Mock 日志数据（使用 state 避免 SSR hydration 不匹配）
  const [mockLogs, setMockLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 从 URL 参数初始化搜索条件，并生成 Mock 数据
  useEffect(() => {
    const userIdParam = searchParams.get('userId');
    const startParam = searchParams.get('start');
    const endParam = searchParams.get('end');

    if (userIdParam) setUserId(userIdParam);
    if (startParam) setStartDate(startParam);
    if (endParam) setEndDate(endParam);

    // 客户端生成 Mock 数据，避免 SSR hydration 不匹配
    setMockLogs(generateMockLogs());
    setIsLoading(false);
  }, [searchParams]);

  // 筛选后的日志列表
  const filteredLogs = useMemo(() => {
    return mockLogs
      .filter((log) => {
        // 按级别筛选
        if (selectedLevel !== 'all' && log.level !== selectedLevel) return false;

        // 按用户 ID 筛选
        if (userId && !log.userId.toLowerCase().includes(userId.toLowerCase())) return false;

        // 按开始日期筛选
        if (startDate) {
          const start = new Date(startDate);
          const logDate = new Date(log.timestamp);
          if (logDate < start) return false;
        }

        // 按结束日期筛选
        if (endDate) {
          const end = new Date(endDate);
          end.setHours(23, 59, 59, 999);
          const logDate = new Date(log.timestamp);
          if (logDate > end) return false;
        }

        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [mockLogs, selectedLevel, userId, startDate, endDate]);

  // 选中的日志详情
  const selectedLog = useMemo(() => {
    return filteredLogs.find((log) => log.id === selectedLogId) || null;
  }, [filteredLogs, selectedLogId]);

  // 执行搜索（更新 URL）
  const handleSearch = () => {
    const params = new URLSearchParams();
    if (userId) params.set('userId', userId);
    if (startDate) params.set('start', startDate);
    if (endDate) params.set('end', endDate);
    const query = params.toString();
    router.push(query ? `/log-viewer?${query}` : '/log-viewer');
  };

  // 格式化时间
  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-10 border-b border-slate-700 bg-slate-800/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-purple-600">
              <Terminal className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">日志查询平台</h1>
              <p className="text-xs text-slate-400">Log Insight Platform</p>
            </div>
          </div>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            返回
          </button>
        </div>
      </header>

      {/* 搜索栏 */}
      <div className="border-b border-slate-700 bg-slate-800/50">
        <div className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="mb-1.5 block text-sm font-medium text-slate-300">用户 ID</label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="请输入用户 ID"
                className="block w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1.5 block text-sm font-medium text-slate-300">开始日期</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="block w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1.5 block text-sm font-medium text-slate-300">结束日期</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="block w-full rounded-lg border border-slate-600 bg-slate-700 px-3 py-2 text-sm text-slate-100 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
            <button
              onClick={handleSearch}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
            >
              <Search className="h-4 w-4" />
              查询
            </button>
          </div>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="mx-auto max-w-7xl px-6 py-6">
        <div className="flex gap-6">
          {/* 左侧：级别筛选 + 日志列表 */}
          <div className="w-1/2 flex flex-col gap-4">
            {/* 日志级别筛选 */}
            <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <h3 className="mb-3 text-sm font-medium text-slate-300">日志级别</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSelectedLevel('all')}
                  className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedLevel === 'all'
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  全部 ({mockLogs.length})
                </button>
                {(Object.keys(levelConfig) as LogLevel[]).map((level) => {
                  const count = mockLogs.filter((l) => l.level === level).length;
                  const cfg = levelConfig[level];
                  return (
                    <button
                      key={level}
                      onClick={() => setSelectedLevel(level)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedLevel === level
                          ? `${cfg.bg} ${cfg.color} border`
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      }`}
                    >
                      {cfg.icon}
                      {cfg.label} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 日志列表 */}
            <div className="flex-1 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
              <div className="border-b border-slate-700 px-4 py-3">
                <h3 className="text-sm font-medium text-slate-300">
                  日志列表 <span className="text-slate-500">({filteredLogs.length} 条)</span>
                </h3>
              </div>
              <div className="max-h-[600px] overflow-y-auto">
                {isLoading ? (
                  <div className="p-8 text-center text-sm text-slate-500">加载中...</div>
                ) : filteredLogs.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">暂无匹配的日志</div>
                ) : (
                  <ul className="divide-y divide-slate-700">
                    {filteredLogs.map((log) => {
                      const cfg = levelConfig[log.level];
                      const isSelected = selectedLogId === log.id;
                      return (
                        <li
                          key={log.id}
                          onClick={() => setSelectedLogId(log.id)}
                          className={`cursor-pointer px-4 py-3 transition-colors ${
                            isSelected ? 'bg-slate-700/50' : 'hover:bg-slate-700/30'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 rounded p-1 ${cfg.bg} ${cfg.color}`}>
                              {cfg.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-sm font-medium text-slate-100">
                                  {log.title}
                                </span>
                                <ChevronRight
                                  className={`h-4 w-4 flex-shrink-0 ${
                                    isSelected ? 'text-blue-400' : 'text-slate-500'
                                  }`}
                                />
                              </div>
                              <div className="mt-1 flex items-center gap-3 text-xs text-slate-400">
                                <span>{formatTime(log.timestamp)}</span>
                                <span className="text-slate-600">|</span>
                                <span>{sourceLabels[log.source]}</span>
                              </div>
                              <p className="mt-1.5 truncate text-xs text-slate-500">{log.content}</p>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>

          {/* 右侧：日志详情面板 */}
          <div className="w-1/2">
            <div className="sticky top-32 overflow-hidden rounded-xl border border-slate-700 bg-slate-800">
              <div className="border-b border-slate-700 px-4 py-3">
                <h3 className="text-sm font-medium text-slate-300">日志详情</h3>
              </div>
              {!selectedLog ? (
                <div className="p-12 text-center">
                  <Terminal className="mx-auto h-12 w-12 text-slate-600" />
                  <p className="mt-3 text-sm text-slate-500">请在左侧选择一条日志查看详情</p>
                </div>
              ) : (
                <div className="max-h-[600px] overflow-y-auto p-4">
                  <div className="space-y-4">
                    {/* 标题和级别 */}
                    <div className="flex items-start gap-3">
                      <div className={`rounded-lg p-2 ${levelConfig[selectedLog.level].bg} ${levelConfig[selectedLog.level].color} border`}>
                        {levelConfig[selectedLog.level].icon}
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-semibold text-white">{selectedLog.title}</h4>
                        <span className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${levelConfig[selectedLog.level].bg} ${levelConfig[selectedLog.level].color} border`}>
                          {levelConfig[selectedLog.level].label}
                        </span>
                      </div>
                    </div>

                    {/* 基本信息 */}
                    <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-900 p-4">
                      <div>
                        <p className="text-xs text-slate-500">时间</p>
                        <p className="mt-1 text-sm text-slate-200">{formatTime(selectedLog.timestamp)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">来源</p>
                        <p className="mt-1 text-sm text-slate-200">{sourceLabels[selectedLog.source]}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">请求 ID</p>
                        <p className="mt-1 font-mono text-sm text-slate-200">{selectedLog.requestId}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">用户 ID</p>
                        <p className="mt-1 font-mono text-sm text-slate-200">{selectedLog.userId}</p>
                      </div>
                    </div>

                    {/* 详细内容 */}
                    <div>
                      <p className="mb-2 text-xs font-medium text-slate-400">详细内容</p>
                      <div className="rounded-lg bg-slate-900 p-4">
                        <p className="text-sm text-slate-200">{selectedLog.content}</p>
                      </div>
                    </div>

                    {/* 堆栈信息 */}
                    {selectedLog.stackTrace && (
                      <div>
                        <p className="mb-2 text-xs font-medium text-slate-400">堆栈信息</p>
                        <div className="overflow-x-auto rounded-lg bg-slate-900 p-4">
                          <pre className="font-mono text-xs text-red-300 whitespace-pre-wrap">
                            {selectedLog.stackTrace}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
