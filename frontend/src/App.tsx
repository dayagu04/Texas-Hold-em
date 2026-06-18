import { useState } from 'react';
import { useSocket } from './hooks/useSocket';
import Login from './components/Login';
import Lobby from './components/Lobby';
import PokerTable from './components/PokerTable';

type Page = 'login' | 'lobby' | 'table';

function App() {
  const { socket, connected } = useSocket();
  const [page, setPage] = useState<Page>('login');
  const [username, setUsername] = useState('');

  const handleLogin = (user: string) => {
    setUsername(user);
    setPage('lobby');
  };

  const handleJoinTable = () => {
    setPage('table');
  };

  if (!connected) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <p className="text-white text-xl">连接服务器中...</p>
      </div>
    );
  }

  return (
    <>
      {page === 'login' && <Login socket={socket} onLogin={handleLogin} />}
      {page === 'lobby' && (
        <Lobby socket={socket} username={username} onJoinTable={handleJoinTable} />
      )}
      {page === 'table' && <PokerTable socket={socket} username={username} />}
    </>
  );
}

export default App;
