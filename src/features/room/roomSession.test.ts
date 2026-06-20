import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomSession } from './roomSession';

// Mock values/functions globally accessible to test assertions
const mockCheckHealth = vi.fn().mockResolvedValue(true);
const mockFetchParticipants = vi.fn().mockResolvedValue([]);
const mockFetchSession = vi.fn().mockResolvedValue(null);
const mockFetchPendingRequests = vi.fn().mockResolvedValue([]);
const mockStartSession = vi.fn().mockResolvedValue(undefined);
const mockTransitionToPrivate = vi.fn().mockResolvedValue(true);
const mockTransitionToConsensus = vi.fn().mockResolvedValue(undefined);
const mockCloseSession = vi.fn().mockResolvedValue(undefined);
const mockApproveRequest = vi.fn().mockResolvedValue(true);
const mockRejectRequest = vi.fn().mockResolvedValue(true);

let offlineCallbackInstance: ((offline: boolean) => void) | undefined;

vi.mock('./services/roomApiService', () => {
  class MockRoomApiService {
    checkHealth = mockCheckHealth;
    fetchParticipants = mockFetchParticipants;
    fetchSession = mockFetchSession;
    fetchPendingRequests = mockFetchPendingRequests;
    startSession = mockStartSession;
    transitionToPrivate = mockTransitionToPrivate;
    transitionToConsensus = mockTransitionToConsensus;
    closeSession = mockCloseSession;
    approveRequest = mockApproveRequest;
    rejectRequest = mockRejectRequest;

    constructor(apiBaseUrl: string, onOfflineStatusChanged?: (offline: boolean) => void) {
      offlineCallbackInstance = onOfflineStatusChanged;
    }
  }
  return {
    RoomApiService: MockRoomApiService,
  };
});

const mockSignalRConnect = vi.fn().mockResolvedValue(undefined);
const mockSignalRDisconnect = vi.fn().mockResolvedValue(undefined);
const mockJoinRoomAsModerator = vi.fn().mockResolvedValue(undefined);
const mockJoinRoomAsParticipantWithName = vi.fn().mockResolvedValue(undefined);
const mockSignalRCastVote = vi.fn().mockResolvedValue(undefined);
const mockSignalRRevealVotes = vi.fn().mockResolvedValue(undefined);
const mockRestartEstimation = vi.fn().mockResolvedValue(undefined);

vi.mock('./services/roomSignalRService', () => {
  class MockRoomSignalRService {
    connect = mockSignalRConnect;
    disconnect = mockSignalRDisconnect;
    joinRoomAsModerator = mockJoinRoomAsModerator;
    joinRoomAsParticipantWithName = mockJoinRoomAsParticipantWithName;
    castVote = mockSignalRCastVote;
    revealVotes = mockSignalRRevealVotes;
    restartEstimation = mockRestartEstimation;
  }
  return {
    RoomSignalRService: MockRoomSignalRService,
  };
});

describe('RoomSession Coordinator', () => {
  const apiBaseUrl = 'http://localhost:5011';
  const roomId = '12345678-1234-1234-1234-123456789012';

  beforeEach(() => {
    vi.stubGlobal('location', { href: '' });
    vi.stubGlobal('window', { location: { href: '' } });
    vi.clearAllMocks();
    offlineCallbackInstance = undefined;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize with correct connection state for Moderator', () => {
    const session = new RoomSession(apiBaseUrl, roomId, 'Carlos', 'Moderator');
    expect(session.isModerator()).toBe(true);
    expect(session.connectionState).toBe('Connected');
  });

  it('should initialize with correct connection state for Developer', () => {
    const session = new RoomSession(apiBaseUrl, roomId, 'Ana', 'Developer', 'req-123');
    expect(session.isModerator()).toBe(false);
    expect(session.connectionState).toBe('WaitingForApproval');
  });

  it('should transition connectionState to Connected on start if developer is already approved in participants list', async () => {
    const session = new RoomSession(apiBaseUrl, roomId, 'Ana', 'Developer', 'req-123');
    expect(session.connectionState).toBe('WaitingForApproval');

    mockFetchParticipants.mockResolvedValueOnce([
      { name: 'Carlos', role: 'Moderator' },
      { name: 'Ana', role: 'Developer' }
    ]);

    await session.start();

    expect(session.connectionState).toBe('Connected');
  });

  it('should notify subscribers when isOffline state changes', async () => {
    const session = new RoomSession(apiBaseUrl, roomId, 'Carlos', 'Moderator');
    let notified = false;
    session.subscribe(() => {
      notified = true;
    });

    // Mock checkHealth to invoke the captured offline status callback
    mockCheckHealth.mockImplementationOnce(async () => {
      if (offlineCallbackInstance) {
        offlineCallbackInstance(true);
      }
      return false;
    });

    await session.checkBackendOffline();

    expect(session.isOffline).toBe(true);
    expect(notified).toBe(true);
  });

  it('should transition isOffline to false when checkHealth succeeds', async () => {
    const session = new RoomSession(apiBaseUrl, roomId, 'Carlos', 'Moderator');
    session.isOffline = true;

    mockCheckHealth.mockImplementationOnce(async () => {
      if (offlineCallbackInstance) {
        offlineCallbackInstance(false);
      }
      return true;
    });

    await session.checkBackendOffline();

    expect(session.isOffline).toBe(false);
  });
});
