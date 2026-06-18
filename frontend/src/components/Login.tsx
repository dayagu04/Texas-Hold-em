import { useState } from 'react';
import { Socket } from 'socket.io-client';

interface LoginProps {
  socket: Socket | null;
  onLogin: (username: string) => void;
}

export default function Login({ socket, onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = () => {
    if (!socket || !username.trim()) return;
    setLoading(true);
    setError('');
    socket.emit('login', { username: username.trim() });
    socket.once('login_result', (data) => {
      setLoading(false);
      if (data.ok) {
        onLogin(username.trim());
      } else {
        setError(data.error);
      }
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-xl shadow-2xl border border-gold p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gold mb-2">♠️ 德州扑克 ♥️</h1>
          <p className="text-gray-400">输入你的用户名开始游戏</p>
        </div>
        <div className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            placeholder="用户名"
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg
                     text-white placeholder-gray-400 focus:outline-none focus:border-gold"
            disabled={loading}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            onClick={handleLogin}
            disabled={loading || !username.trim()}
            className="w-full py-3 bg-gold hover:bg-gold-dark text-gray-900 font-bold
                     rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '登录中...' : '进入大厅'}
          </button>
        </div>
      </div>
    </div>
  );
}