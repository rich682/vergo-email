"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Bell, Check, MessageSquare, Mail, UserPlus, RefreshCw, ClipboardList, AtSign } from "lucide-react"
import { formatDistanceToNow } from "date-fns"

interface Notification {
  id: string
  type: string
  title: string
  body: string | null
  read: boolean
  taskInstanceId: string | null
  actorId: string | null
  createdAt: string
  taskInstance?: { id: string; name: string } | null
}

export function NotificationBell() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Fetch unread count periodically
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/count")
      if (res.ok) {
        const data = await res.json()
        setUnreadCount(data.unreadCount || 0)
      }
    } catch {}
  }, [])

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 30000) // Every 30 seconds
    return () => clearInterval(interval)
  }, [fetchCount])

  // Fetch notifications when dropdown opens
  const fetchNotifications = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/notifications?limit=15")
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unreadCount || 0)
      }
    } catch (error) {
      console.error("Error fetching notifications:", error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = () => {
    if (!open) {
      fetchNotifications()
    }
    setOpen(!open)
  }

  const handleMarkAllRead = async () => {
    try {
      await fetch("/api/notifications", { method: "PATCH" })
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
      setUnreadCount(0)
    } catch {}
  }

  const handleClickNotification = async (notification: Notification) => {
    // Mark as read
    if (!notification.read) {
      try {
        await fetch(`/api/notifications/${notification.id}`, { method: "PATCH" })
        setNotifications((prev) =>
          prev.map((n) => (n.id === notification.id ? { ...n, read: true } : n))
        )
        setUnreadCount((prev) => Math.max(0, prev - 1))
      } catch {}
    }

    setOpen(false)

    // Navigate to the task if there is one
    if (notification.taskInstanceId) {
      router.push(`/dashboard/jobs/${notification.taskInstanceId}`)
    }
  }

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [open])

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "comment":
        return <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
      case "mention":
        return <AtSign className="w-3.5 h-3.5 text-purple-500" />
      case "reply":
        return <Mail className="w-3.5 h-3.5 text-green-500" />
      case "status_change":
        return <RefreshCw className="w-3.5 h-3.5 text-purple-500" />
      case "collaborator_added":
        return <UserPlus className="w-3.5 h-3.5 text-orange-500" />
      case "request_sent":
        return <Mail className="w-3.5 h-3.5 text-blue-500" />
      case "form_response":
        return <ClipboardList className="w-3.5 h-3.5 text-teal-500" />
      case "form_request":
        return <ClipboardList className="w-3.5 h-3.5 text-orange-500" />
      default:
        return <Bell className="w-3.5 h-3.5 text-gray-400" />
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleToggle}
        className="w-10 h-10 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors relative"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg z-50">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div className="py-8 text-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400 mx-auto" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-8 text-center">
                <Bell className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No notifications yet</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => handleClickNotification(notification)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors flex items-start gap-3 ${
                    !notification.read ? "bg-blue-50/50" : ""
                  }`}
                >
                  <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    {getNotificationIcon(notification.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${!notification.read ? "font-medium text-gray-900" : "text-gray-700"}`}>
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{notification.body}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">
                        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                      </span>
                      {notification.taskInstance && (
                        <span className="text-[10px] text-gray-400 truncate">
                          {notification.taskInstance.name}
                        </span>
                      )}
                    </div>
                  </div>
                  {!notification.read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
