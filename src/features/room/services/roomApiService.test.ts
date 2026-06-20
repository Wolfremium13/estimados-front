import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RoomApiService } from './roomApiService';

describe('RoomApiService', () => {
  const apiBaseUrl = 'http://localhost:5011';

  beforeEach(() => {
    vi.stubGlobal('location', { href: '' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should trigger offline callback as false when fetch succeeds', async () => {
    let offlineCalledVal: boolean | null = null;
    const service = new RoomApiService(apiBaseUrl, (offline) => {
      offlineCalledVal = offline;
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: 'healthy' })
    });
    vi.stubGlobal('fetch', mockFetch);

    const isHealthy = await service.checkHealth();
    expect(isHealthy).toBe(true);
    expect(offlineCalledVal).toBe(false);
  });

  it('should trigger offline callback as true when fetch fails', async () => {
    let offlineCalledVal: boolean | null = null;
    const service = new RoomApiService(apiBaseUrl, (offline) => {
      offlineCalledVal = offline;
    });

    const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', mockFetch);

    const isHealthy = await service.checkHealth();
    expect(isHealthy).toBe(false);
    expect(offlineCalledVal).toBe(true);
  });

  it('should parse session DTOs successfully', async () => {
    const service = new RoomApiService(apiBaseUrl);
    const mockSession = {
      sessionId: 'sess-123',
      roomId: 'room-123',
      storyDescription: 'Story info',
      currentState: 'PrivateEstimation',
      consensusValue: null,
      hasDiscrepancy: false,
      flaggedSpecialCards: [],
      votes: []
    };

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockSession
    });
    vi.stubGlobal('fetch', mockFetch);

    const session = await service.fetchSession('room-123');
    expect(session).toEqual(mockSession);
  });

  it('should return memory_reset string when session fetch returns 404', async () => {
    const service = new RoomApiService(apiBaseUrl);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404
    });
    vi.stubGlobal('fetch', mockFetch);

    const session = await service.fetchSession('room-123');
    expect(session).toBe('memory_reset');
  });

  it('should return null when session fetch returns 204', async () => {
    const service = new RoomApiService(apiBaseUrl);

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204
    });
    vi.stubGlobal('fetch', mockFetch);

    const session = await service.fetchSession('room-123');
    expect(session).toBeNull();
  });
});
