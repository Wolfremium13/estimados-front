import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomSignalRService, type SignalRCallbacks } from './roomSignalRService';

// Mock SignalR Hub connection
const mockHubConnection = {
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(undefined),
  onreconnecting: vi.fn(),
  onreconnected: vi.fn(),
  onclose: vi.fn(),
  on: vi.fn(),
  invoke: vi.fn().mockResolvedValue(undefined),
};

vi.mock('@microsoft/signalr', () => {
  class MockHubConnectionBuilder {
    withUrl() {
      return this;
    }
    withAutomaticReconnect() {
      return this;
    }
    build() {
      return mockHubConnection;
    }
  }
  return {
    HubConnectionBuilder: MockHubConnectionBuilder,
  };
});

describe('RoomSignalRService', () => {
  const apiBaseUrl = 'http://localhost:5011';
  let service: RoomSignalRService;

  beforeEach(() => {
    service = new RoomSignalRService(apiBaseUrl);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create hub connection and register listeners on connect', async () => {
    const callbacks: SignalRCallbacks = {
      onReconnecting: vi.fn(),
      onReconnected: vi.fn(),
      onClose: vi.fn(),
      onParticipantConnectionStatusChanged: vi.fn(),
      onJoinRequestReceived: vi.fn(),
      onJoinRequestApproved: vi.fn(),
      onJoinRequestRejected: vi.fn(),
      onRoomClosed: vi.fn(),
      onVoteCast: vi.fn(),
      onVotesRevealed: vi.fn(),
      onSessionHalted: vi.fn(),
      onVotesRestarted: vi.fn(),
      onSessionUpdated: vi.fn(),
    };

    await service.connect(callbacks);

    expect(mockHubConnection.start).toHaveBeenCalledTimes(1);
  });

  it('should call stop on disconnect', async () => {
    const callbacks = {} as any;
    await service.connect(callbacks);
    await service.disconnect();

    expect(mockHubConnection.stop).toHaveBeenCalledTimes(1);
  });

  it('should invoke hub methods correctly', async () => {
    const callbacks = {} as any;
    await service.connect(callbacks);

    await service.joinRoomAsModerator('room-123');
    expect(mockHubConnection.invoke).toHaveBeenCalledWith('JoinRoomAsModerator', 'room-123');

    await service.joinRoomAsParticipantWithName('room-123', 'Carlos');
    expect(mockHubConnection.invoke).toHaveBeenCalledWith('JoinRoomAsParticipantWithName', 'room-123', 'Carlos');

    await service.castVote('room-123', 'Carlos', '5');
    expect(mockHubConnection.invoke).toHaveBeenCalledWith('CastVote', 'room-123', 'Carlos', '5');
  });
});
