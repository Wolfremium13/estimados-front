import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RoomSession } from './RoomSession';

// Mock SignalR
vi.mock('@microsoft/signalr', () => {
  return {
    HubConnectionBuilder: vi.fn().mockImplementation(() => {
      return {
        withUrl: vi.fn().mockReturnThis(),
        withAutomaticReconnect: vi.fn().mockReturnThis(),
        build: vi.fn().mockImplementation(() => {
          return {
            start: vi.fn().mockResolvedValue(undefined),
            stop: vi.fn().mockResolvedValue(undefined),
            onreconnecting: vi.fn(),
            onreconnected: vi.fn(),
            onclose: vi.fn(),
            on: vi.fn(),
            invoke: vi.fn().mockResolvedValue(undefined),
          };
        }),
      };
    }),
  };
});

describe('RoomSession', () => {
  const apiBaseUrl = 'http://localhost:5011';
  const roomId = '12345678-1234-1234-1234-123456789012';

  beforeEach(() => {
    vi.stubGlobal('location', { href: '' });
    vi.stubGlobal('window', { location: { href: '' } });
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

  it('should notify subscribers when setOffline is called', () => {
    const session = new RoomSession(apiBaseUrl, roomId, 'Carlos', 'Moderator');
    let notified = false;
    session.subscribe(() => {
      notified = true;
    });

    // Directly trigger checkBackendOffline failing
    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    // Call state-changing logic
    session.checkBackendOffline().then(() => {
      expect(session.isOffline).toBe(true);
      expect(notified).toBe(true);
    });
  });

  it('should transition isOffline to false when fetch succeeds', async () => {
    const session = new RoomSession(apiBaseUrl, roomId, 'Carlos', 'Moderator');
    session.isOffline = true;

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({})
    });
    vi.stubGlobal('fetch', mockFetch);

    await session.checkBackendOffline();

    expect(session.isOffline).toBe(false);
  });
});
