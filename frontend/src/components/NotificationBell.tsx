import { useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { useMarkNotificationRead, useNotifications } from '@/hooks/use-notifications';
import { formatTimestamp } from '@/lib/utils';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((value) => !value)}
        className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {!!data?.unread && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {data.unread > 9 ? '9+' : data.unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          <div className="flex items-center justify-between px-2 py-2">
            <h2 className="text-sm font-semibold text-slate-800">Notifications</h2>
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
          </div>
          {!isLoading && !data?.notifications.length && (
            <p className="px-2 py-5 text-center text-xs text-slate-500">You are all caught up.</p>
          )}
          <div className="max-h-96 overflow-y-auto">
            {data?.notifications.map((notification) => (
              <button
                key={notification.id}
                onClick={() => {
                  if (!notification.read_at) markRead.mutate(notification.id);
                }}
                className={`w-full rounded-lg p-3 text-left transition-colors hover:bg-slate-50 ${
                  notification.read_at ? '' : 'bg-teal-50/60'
                }`}
              >
                <div className="flex gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-slate-800">{notification.title}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{notification.message}</p>
                    <p className="mt-1 text-[10px] text-slate-400">{formatTimestamp(notification.created_at)}</p>
                  </div>
                  {!notification.read_at && <Check className="h-4 w-4 shrink-0 text-teal-600" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
