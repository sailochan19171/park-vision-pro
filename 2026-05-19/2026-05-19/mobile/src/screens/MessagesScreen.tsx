import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Colors } from '../utils/colors';
import useAuthStore from '../store/auth';
import api from '../api/client';

interface Message {
  id: string;
  senderName: string;
  subject: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

function formatMessageDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();

  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();

  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

interface MessageCardProps {
  item: Message;
}

function MessageCard({ item }: MessageCardProps) {
  return (
    <View
      style={[
        styles.card,
        !item.isRead && styles.cardUnread,
      ]}
    >
      <View style={styles.cardHeader}>
        <Text style={styles.cardSender} numberOfLines={1}>
          {item.senderName}
        </Text>
        <Text style={styles.cardDate}>{formatMessageDate(item.createdAt)}</Text>
      </View>
      <Text
        style={[styles.cardSubject, !item.isRead && styles.cardSubjectUnread]}
        numberOfLines={1}
      >
        {item.subject}
      </Text>
      <Text style={styles.cardBody} numberOfLines={2}>
        {item.body}
      </Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>✉️</Text>
      <Text style={styles.emptyText}>No messages</Text>
    </View>
  );
}

export default function MessagesScreen() {
  const user = useAuthStore((s) => s.user);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await api.get('/messages', {
        params: { userCode: user?.code },
      });
      const data: Message[] = Array.isArray(res.data)
        ? res.data
        : res.data?.data ?? [];
      setMessages(data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status !== 404) {
        console.warn('Messages fetch error:', err?.message);
      }
      // 404 or any error: show empty list silently
      setMessages([]);
    }
  }, [user?.code]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchMessages();
      setLoading(false);
    })();
  }, [fetchMessages]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMessages();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MessageCard item={item} />}
        contentContainerStyle={[
          styles.listContent,
          messages.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[Colors.primary]}
            tintColor={Colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 32,
  },
  listContentEmpty: {
    flex: 1,
    justifyContent: 'center',
  },

  // Message card
  card: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: Colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
    }),
  },
  cardUnread: {
    borderLeftColor: Colors.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardSender: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  cardDate: {
    fontSize: 12,
    color: Colors.textSecondary,
    flexShrink: 0,
  },
  cardSubject: {
    fontSize: 15,
    fontWeight: '500',
    color: Colors.text,
    marginBottom: 6,
    lineHeight: 20,
  },
  cardSubjectUnread: {
    fontWeight: '700',
  },
  cardBody: {
    fontSize: 13,
    color: Colors.textSecondary,
    lineHeight: 18,
  },

  // Empty state
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '500',
  },
});
