import { useEffect, useState } from 'react';
import { Socket } from 'socket.io-client';
import type { TableState, Card as CardType } from '../types';

interface PokerTableProps {
  socket: Socket | null;
  username: string;
}

export default function PokerTable({ socket, username }: PokerTableProps) {
  const [table, setTable] = useState<TableState | null>(null);
  const [raiseAmount, setRaiseAmount] = useState(0);
  const [error, setError] = useState('');
  const [animateChips, setAnimateChips] = useState(false);
  const [showWinnerAnimation, setShowWinnerAnimation] = useState(false);

  useEffect(() => {
    if (!socket) return;
    socket.on('table_update', (data: TableState) => {
      setTable(data);
      setAnimateChips(true);
      setTimeout(() => setAnimateChips(false), 300);

      // Show winner animation
      if (data.phase === 'showdown' && data.winners && data.winners.length > 0) {
        setShowWinnerAnimation(true);
        setTimeout(() => setShowWinnerAnimation(false), 3000);
      }
    });
    socket.on('error', (data) => {
      setError(data.msg);
      setTimeout(() => setError(''), 3000);
    });
    return () => {
      socket.off('table_update');
      socket.off('error');
    };
  }, [socket]);

  const sendAction = (action: string, amount?: number) => {
    if (!socket) return;
    socket.emit('player_action', { action, amount });
  };

  const startHand = () => {
    if (!socket) return;
    socket.emit('start_hand', {});
  };

  const addBot = () => {
    if (!socket) return;
    socket.emit('add_bot', {});
  };

  const renderCard = (card: CardType) => {
    const suitSymbols: { [key: string]: string } = {
      'hearts': '♥',
      'diamonds': '♦',
      'clubs': '♣',
      'spades': '♠'
    };
    const suitColors: { [key: string]: string } = {
      'hearts': 'text-red-600',
      'diamonds': 'text-red-600',
      'clubs': 'text-gray-800',
      'spades': 'text-gray-800'
    };
    return (
      <div className="relative w-16 h-24 bg-white rounded-lg shadow-2xl transform hover:scale-105
                      transition-all duration-300 border-2 border-gray-200
                      animate-[flipIn_0.5s_ease-out]">
        <div className={`absolute top-1 left-1.5 font-bold text-xl ${suitColors[card.suit]}`}>
          {card.rank}
        </div>
        <div className={`absolute top-1 right-1.5 font-bold text-xl ${suitColors[card.suit]}`}>
          {card.rank}
        </div>
        <div className={`absolute inset-0 flex items-center justify-center text-5xl ${suitColors[card.suit]}`}>
          {suitSymbols[card.suit]}
        </div>
        <div className={`absolute bottom-1 left-1.5 font-bold text-xl ${suitColors[card.suit]} rotate-180`}>
          {card.rank}
        </div>
        <div className={`absolute bottom-1 right-1.5 font-bold text-xl ${suitColors[card.suit]} rotate-180`}>
          {card.rank}
        </div>
      </div>
    );
  };

  const renderPlayer = (player: any, position: number) => {
    const isCurrentPlayer = player.name === username;
    const isActive = table?.current_player === player.name;
    const hasWon = table?.winners?.includes(player.name);

    return (
      <div className={`absolute transform -translate-x-1/2 -translate-y-1/2
                      ${isActive ? 'animate-pulse-glow' : ''}`}
           style={getPlayerPosition(position, table?.players.length || 0)}>
        <div className={`relative bg-gradient-to-br ${isCurrentPlayer
                        ? 'from-blue-900 to-blue-700 border-blue-400'
                        : hasWon
                        ? 'from-yellow-600 to-yellow-800 border-yellow-400 animate-winner-glow'
                        : 'from-gray-800 to-gray-900 border-gray-600'}
                      rounded-2xl p-4 shadow-2xl border-2 min-w-[180px]
                      ${isActive ? 'ring-4 ring-green-400 ring-opacity-75' : ''}
                      transform hover:scale-105 transition-all duration-300`}>

          {/* Player Info */}
          <div className="text-center mb-2">
            <div className={`font-bold text-lg ${isCurrentPlayer ? 'text-yellow-300' : 'text-white'}
                          ${hasWon ? 'animate-bounce' : ''}`}>
              {player.name}
            </div>
            {player.position && (
              <div className="text-xs text-yellow-400 font-semibold">
                {player.position === 'dealer' && '🎯 庄家'}
                {player.position === 'sb' && '🔹 小盲'}
                {player.position === 'bb' && '🔸 大盲'}
              </div>
            )}
          </div>

          {/* Chips with Gold Icon */}
          <div className="flex items-center justify-center gap-2 mb-2">
            <span className="text-2xl">💰</span>
            <span className={`text-yellow-400 font-bold text-xl ${animateChips ? 'animate-chip-bounce' : ''}`}>
              ${player.stack}
            </span>
          </div>

          {/* Current Bet */}
          {player.bet > 0 && (
            <div className="absolute -top-3 -right-3 bg-red-600 text-white rounded-full px-3 py-1
                          shadow-lg border-2 border-red-400 font-bold animate-[slideIn_0.3s_ease-out]">
              ${player.bet}
            </div>
          )}

          {/* Cards */}
          {player.cards && player.cards.length > 0 && (
            <div className="flex gap-1 justify-center mt-2">
              {player.cards.map((card: CardType, i: number) => (
                <div key={i} className="transform hover:translate-y-[-8px] transition-transform">
                  {renderCard(card)}
                </div>
              ))}
            </div>
          )}

          {/* Status */}
          {player.folded && (
            <div className="absolute inset-0 bg-black bg-opacity-70 rounded-2xl
                          flex items-center justify-center">
              <span className="text-red-400 font-bold text-xl">已弃牌</span>
            </div>
          )}
          {player.all_in && (
            <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2
                          bg-purple-600 text-white px-3 py-1 rounded-full shadow-lg
                          font-bold animate-pulse">
              ALL IN!
            </div>
          )}
        </div>
      </div>
    );
  };

  const getPlayerPosition = (index: number, total: number) => {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    const radiusX = 42;
    const radiusY = 35;
    const x = 50 + radiusX * Math.cos(angle);
    const y = 50 + radiusY * Math.sin(angle);
    return { left: `${x}%`, top: `${y}%` };
  };

  if (!table) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900
                    flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-yellow-500 mx-auto mb-4"></div>
          <p className="text-yellow-500 text-xl font-semibold">加载中...</p>
        </div>
      </div>
    );
  }

  const currentPlayer = table.players.find(p => p.name === username);
  const isMyTurn = table.current_player === username;
  const minRaise = table.current_bet + table.big_blind;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-gray-900
                  flex flex-col items-center justify-center p-4 relative overflow-hidden">

      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10"
           style={{
             backgroundImage: `radial-gradient(circle at 20% 50%, rgba(255,215,0,0.1) 0%, transparent 50%),
                              radial-gradient(circle at 80% 50%, rgba(255,215,0,0.1) 0%, transparent 50%)`
           }}>
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-50
                      bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl
                      animate-[slideDown_0.3s_ease-out] font-bold">
          ⚠️ {error}
        </div>
      )}

      {/* Winner Celebration */}
      {showWinnerAnimation && table.winners && table.winners.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-40 pointer-events-none">
          <div className="bg-black bg-opacity-80 px-12 py-8 rounded-3xl
                        animate-[zoomIn_0.5s_ease-out] shadow-2xl border-4 border-yellow-400">
            <div className="text-6xl text-yellow-400 font-bold mb-4 animate-pulse text-center">
              🎉 恭喜获胜！ 🎉
            </div>
            <div className="text-3xl text-white text-center">
              {table.winners.join(', ')}
            </div>
          </div>
        </div>
      )}

      {/* Main Poker Table */}
      <div className="relative w-[90vw] max-w-5xl aspect-[16/10]">

        {/* Table Surface */}
        <div className="absolute inset-0 bg-gradient-to-br from-green-800 via-green-700 to-green-900
                      rounded-[50%] shadow-[inset_0_0_50px_rgba(0,0,0,0.5),0_20px_60px_rgba(0,0,0,0.8)]
                      border-[12px] border-amber-900
                      before:absolute before:inset-4 before:rounded-[50%]
                      before:border-4 before:border-yellow-600 before:opacity-30">

          {/* Table Felt Texture */}
          <div className="absolute inset-0 rounded-[50%] opacity-20"
               style={{
                 backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px,
                                  rgba(0,0,0,0.1) 10px, rgba(0,0,0,0.1) 20px)`
               }}>
          </div>
        </div>

        {/* Center Area - Community Cards and Pot */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-10">

          {/* Pot Display */}
          <div className="text-center mb-6">
            <div className="inline-block bg-gradient-to-br from-yellow-600 via-yellow-500 to-yellow-700
                          px-8 py-4 rounded-2xl shadow-2xl border-4 border-yellow-400
                          animate-[glow_2s_ease-in-out_infinite]">
              <div className="text-sm text-yellow-200 font-semibold mb-1">底池</div>
              <div className="text-4xl font-bold text-white flex items-center gap-2">
                <span className="text-3xl">💎</span>
                ${table.pot}
                <span className="text-3xl">💎</span>
              </div>
            </div>
          </div>

          {/* Community Cards */}
          {table.community_cards && table.community_cards.length > 0 && (
            <div className="flex gap-3 justify-center p-6 bg-black bg-opacity-30
                          rounded-2xl shadow-[0_0_30px_rgba(255,215,0,0.3)]
                          border-2 border-yellow-600 border-opacity-50">
              {table.community_cards.map((card, i) => (
                <div key={i} className="transform hover:scale-110 transition-transform">
                  {renderCard(card)}
                </div>
              ))}
            </div>
          )}

          {/* Phase Display */}
          <div className="text-center mt-4">
            <div className="inline-block bg-gray-900 bg-opacity-80 px-6 py-2
                          rounded-full border-2 border-yellow-600 shadow-lg">
              <span className="text-yellow-400 font-bold text-lg uppercase tracking-wider">
                {table.phase === 'preflop' && '翻牌前'}
                {table.phase === 'flop' && '翻牌'}
                {table.phase === 'turn' && '转牌'}
                {table.phase === 'river' && '河牌'}
                {table.phase === 'showdown' && '摊牌'}
                {table.phase === 'waiting' && '等待开始'}
              </span>
            </div>
          </div>
        </div>

        {/* Players */}
        {table.players.map((player, i) => (
          <div key={i}>
            {renderPlayer(player, i)}
          </div>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="mt-8 flex flex-wrap gap-4 justify-center items-center z-20">

        {/* Start Hand Button */}
        {table.phase === 'waiting' && (
          <button
            onClick={startHand}
            className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600
                     text-white font-bold py-4 px-8 rounded-xl shadow-2xl
                     transform hover:scale-105 active:scale-95 transition-all
                     border-2 border-green-400 text-xl">
            🎲 开始新局
          </button>
        )}

        {/* Add Bot Button */}
        <button
          onClick={addBot}
          className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600
                   text-white font-bold py-4 px-8 rounded-xl shadow-2xl
                   transform hover:scale-105 active:scale-95 transition-all
                   border-2 border-purple-400 text-xl">
          🤖 添加机器人
        </button>

        {/* Player Action Buttons */}
        {isMyTurn && currentPlayer && !currentPlayer.folded && (
          <>
            <button
              onClick={() => sendAction('fold')}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600
                       text-white font-bold py-3 px-6 rounded-xl shadow-xl
                       transform hover:scale-105 active:scale-95 transition-all
                       border-2 border-red-400">
              ❌ 弃牌
            </button>

            {table.current_bet === 0 ? (
              <button
                onClick={() => sendAction('check')}
                className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600
                         text-white font-bold py-3 px-6 rounded-xl shadow-xl
                         transform hover:scale-105 active:scale-95 transition-all
                         border-2 border-blue-400">
                ✓ 过牌
              </button>
            ) : (
              <button
                onClick={() => sendAction('call', table.current_bet)}
                className="bg-gradient-to-r from-yellow-600 to-yellow-700 hover:from-yellow-500 hover:to-yellow-600
                         text-white font-bold py-3 px-6 rounded-xl shadow-xl
                         transform hover:scale-105 active:scale-95 transition-all
                         border-2 border-yellow-400">
                📞 跟注 ${table.current_bet}
              </button>
            )}

            <div className="flex gap-2 items-center">
              <input
                type="number"
                min={minRaise}
                max={currentPlayer.stack}
                value={raiseAmount}
                onChange={(e) => setRaiseAmount(Number(e.target.value))}
                className="w-32 px-4 py-3 rounded-lg bg-gray-800 text-white border-2 border-gray-600
                         focus:border-green-400 focus:outline-none font-bold text-lg"
                placeholder={`${minRaise}`}
              />
              <button
                onClick={() => sendAction('raise', raiseAmount)}
                disabled={raiseAmount < minRaise || raiseAmount > currentPlayer.stack}
                className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-500 hover:to-green-600
                         disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed
                         text-white font-bold py-3 px-6 rounded-xl shadow-xl
                         transform hover:scale-105 active:scale-95 transition-all
                         border-2 border-green-400 disabled:border-gray-600">
                🚀 加注
              </button>
            </div>

            <button
              onClick={() => sendAction('all_in')}
              className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600
                       text-white font-bold py-3 px-6 rounded-xl shadow-xl
                       transform hover:scale-105 active:scale-95 transition-all
                       border-2 border-purple-400 animate-pulse">
              💥 全下
            </button>
          </>
        )}
      </div>

      {/* Player Info Bar */}
      <div className="absolute bottom-4 left-4 bg-gray-900 bg-opacity-90 px-6 py-3
                    rounded-xl shadow-xl border-2 border-gray-700">
        <div className="text-yellow-400 font-bold">
          玩家: {username}
        </div>
        {currentPlayer && (
          <div className="text-white">
            筹码: <span className="text-green-400 font-bold">${currentPlayer.stack}</span>
          </div>
        )}
      </div>

      {/* Game Info */}
      <div className="absolute bottom-4 right-4 bg-gray-900 bg-opacity-90 px-6 py-3
                    rounded-xl shadow-xl border-2 border-gray-700">
        <div className="text-gray-400 text-sm">
          小盲: <span className="text-white font-bold">${table.small_blind}</span>
        </div>
        <div className="text-gray-400 text-sm">
          大盲: <span className="text-white font-bold">${table.big_blind}</span>
        </div>
        {table.current_player && (
          <div className="text-green-400 font-bold mt-1">
            当前行动: {table.current_player}
          </div>
        )}
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes pulse-glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(34, 197, 94, 0.5);
          }
          50% {
            box-shadow: 0 0 40px rgba(34, 197, 94, 0.8);
          }
        }
        @keyframes winner-glow {
          0%, 100% {
            box-shadow: 0 0 30px rgba(234, 179, 8, 0.8);
            transform: scale(1);
          }
          50% {
            box-shadow: 0 0 50px rgba(234, 179, 8, 1);
            transform: scale(1.05);
          }
        }
        @keyframes glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(234, 179, 8, 0.5);
          }
          50% {
            box-shadow: 0 0 40px rgba(234, 179, 8, 0.8);
          }
        }
        @keyframes chip-bounce {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.2); }
        }
        @keyframes flipIn {
          0% {
            transform: rotateY(90deg);
            opacity: 0;
          }
          100% {
            transform: rotateY(0);
            opacity: 1;
          }
        }
        @keyframes slideIn {
          from {
            transform: translateY(-20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes slideDown {
          from {
            transform: translate(-50%, -100%);
            opacity: 0;
          }
          to {
            transform: translate(-50%, 0);
            opacity: 1;
          }
        }
        @keyframes zoomIn {
          from {
            transform: scale(0.5);
            opacity: 0;
          }
          to {
            transform: scale(1);
            opacity: 1;
          }
        }
        .animate-pulse-glow {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        .animate-winner-glow {
          animation: winner-glow 1.5s ease-in-out infinite;
        }
        .animate-chip-bounce {
          animation: chip-bounce 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}









