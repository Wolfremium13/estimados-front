export interface ParticipantDto {
  name: string;
  role: string;
}

export interface ParticipantVoteDto {
  name: string;
  card: string | null;
}

export interface EstimationSessionDto {
  sessionId: string;
  roomId: string;
  storyDescription: string;
  currentState: string;
  consensusValue: string | null;
  hasDiscrepancy: boolean;
  flaggedSpecialCards: string[];
  votes: ParticipantVoteDto[];
}

export interface PendingRequestModel {
  requestId: string;
  name: string;
  role: string;
}

export class RoomApiService {
  private apiBaseUrl: string;
  private onOfflineStatusChanged?: (offline: boolean) => void;

  constructor(apiBaseUrl: string, onOfflineStatusChanged?: (offline: boolean) => void) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.onOfflineStatusChanged = onOfflineStatusChanged;
  }

  private async apiFetch(path: string, options?: RequestInit): Promise<Response> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/${path}`, options);
      this.onOfflineStatusChanged?.(false);
      return res;
    } catch (err) {
      this.onOfflineStatusChanged?.(true);
      throw err;
    }
  }

  public async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const res = await fetch(`${this.apiBaseUrl}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // If we got a response back (even 404 or 500), the server is online
      this.onOfflineStatusChanged?.(false);
      return true;
    } catch (err) {
      this.onOfflineStatusChanged?.(true);
      return false;
    }
  }

  public async fetchSession(roomId: string): Promise<EstimationSessionDto | null | 'memory_reset'> {
    const res = await this.apiFetch(`v1/rooms/${roomId}/session`);
    if (res.status === 204) {
      return null;
    }
    if (res.status === 404) {
      return 'memory_reset';
    }
    if (res.ok) {
      return await res.json() as EstimationSessionDto;
    }
    throw new Error(`Failed to fetch session: ${res.statusText}`);
  }

  public async fetchParticipants(roomId: string): Promise<ParticipantDto[] | 'memory_reset'> {
    const res = await this.apiFetch(`v1/rooms/${roomId}/participants`);
    if (res.status === 404) {
      return 'memory_reset';
    }
    if (res.ok) {
      return await res.json() as ParticipantDto[];
    }
    throw new Error(`Failed to fetch participants: ${res.statusText}`);
  }

  public async fetchPendingRequests(roomId: string): Promise<PendingRequestModel[] | 'memory_reset'> {
    const res = await this.apiFetch(`v1/rooms/${roomId}/join-requests`);
    if (res.status === 404) {
      return 'memory_reset';
    }
    if (res.ok) {
      return await res.json() as PendingRequestModel[];
    }
    throw new Error(`Failed to fetch pending requests: ${res.statusText}`);
  }

  public async createRoom(moderatorName: string): Promise<{ roomId: string; moderatorName: string } | null> {
    const res = await this.apiFetch(`v1/rooms?moderatorName=${encodeURIComponent(moderatorName)}`, {
      method: 'POST',
    });
    if (res.ok) {
      return await res.json();
    }
    return null;
  }

  public async joinRoom(roomId: string, participantName: string, role: string): Promise<{ requestId: string } | null> {
    const res = await this.apiFetch(`v1/rooms/${roomId}/join-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: participantName, role }),
    });
    if (res.ok) {
      return await res.json();
    }
    return null;
  }

  public async startSession(roomId: string, storyDescription: string): Promise<void> {
    await this.apiFetch(`v1/rooms/${roomId}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyDescription }),
    });
  }

  public async transitionToPrivate(roomId: string): Promise<boolean> {
    const res = await this.apiFetch(`v1/rooms/${roomId}/session/transition/private`, {
      method: 'POST',
    });
    return res.ok;
  }

  public async transitionToConsensus(roomId: string): Promise<void> {
    await this.apiFetch(`v1/rooms/${roomId}/session/transition/consensus`, {
      method: 'POST',
    });
  }

  public async closeSession(roomId: string): Promise<void> {
    await this.apiFetch(`v1/rooms/${roomId}/session/close`, {
      method: 'POST',
    });
  }

  public async approveRequest(roomId: string, requestId: string): Promise<boolean> {
    const res = await this.apiFetch(`v1/rooms/${roomId}/join-requests/${requestId}/approve`, {
      method: 'POST',
    });
    return res.ok;
  }

  public async rejectRequest(roomId: string, requestId: string): Promise<boolean> {
    const res = await this.apiFetch(`v1/rooms/${roomId}/join-requests/${requestId}/reject`, {
      method: 'POST',
    });
    return res.ok;
  }
}
