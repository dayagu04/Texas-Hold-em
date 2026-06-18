import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import type { LobbyTable } from '../types';

interface LobbyProps {
  socket: Socket | null;
  username: string;
  onJoinTable: () => void;
}

export default function Lobby({ socket, username, onJoinTable }: LobbyProps) {
  const [tables, setTables] = useState<LobbyTable[]>([]);
  const [tableName, setTableName] = useState('');

  useEffect(() => {
    if (!socket) return;
    socket.on('lobby_update', (data) => {
      setTables(data.tables);
    });
    return () => {
      socket.off('lobby_update');
    };
  }, [socket]);

  const createTable = () => {
    if (!socket) return;
    socket.emit('create_table', { name: tableName || `${username}的牌桌` });
    setTableName('');
    onJoinTable();
  };

  const joinTable = (tableId: string) => {
    if (!socket) return;
    socket.emit('join_table', { table_id: tableId });
    onJoinTable();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gray-800 rounded-xl border border-gold p-6 mb-6">
          <h1 className="text-3xl font-bold text-gold mb-2">🎰 游戏大厅</h1>
          <p className="text-gray-400">欢迎, <span className="text-gold">{username}</span></p>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">创建新牌桌</h2>
          <div className="flex gap-3">
            <input
              type="text"
              value={tableName}
              onChange={(e) => setTableName(e.target.value)}
              placeholder="牌桌名称（可选）"
              className="flex-1 px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg
                       text-white placeholder-gray-400 focus:outline-none focus:border-gold"
            />
            <button
              onClick={createTable}
              className="px-6 py-2 bg-gold hover:bg-gold-dark text-gray-900 font-bold
                       rounded-lg transition"
            >
              创建
            </button>
          </div>
        </div>

        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h2 className="text-xl font-bold text-white mb-4">现有牌桌</h2>
          {tables.length === 0 ? (
            <p className="text-gray-400 text-center py-8">暂无牌桌，创建一个开始游戏！</p>
          ) : (
            <div className="space-y-3">
              {tables.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between p-4 bg-gray-700 rounded-lg
                           hover:bg-gray-600 transition"
                >
                  <div>
                    <h3 className="text-white font-semibold">{t.name}</h3>
                    <p className="text-gray-400 text-sm">座位: {t.seats}</p>
                  </div>
                  <button
                    onClick={() => joinTable(t.id)}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white
                             font-semibold rounded-lg transition"
                  >
                    加入
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}