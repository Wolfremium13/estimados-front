import * as signalR from '@microsoft/signalr';

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

export type ConnectionState = 'Connecting' | 'WaitingForApproval' | 'Rejected' | 'Connected' | 'Disconnected';

export class RoomSession {
  public apiBaseUrl: string;
  public hubUrl: string;
  public roomId: string;
  public participantName: string;
  public participantRole: string;
  public requestId: string | null = null;

  public connectionState: ConnectionState = 'Connecting';
  public currentSession: EstimationSessionDto | null = null;
  public roomParticipants: ParticipantDto[] = [];
  public votedParticipants: Set<string> = new Set();
  public participantOnlineStatus: Map<string, boolean> = new Map();
  public pendingRequests: PendingRequestModel[] = [];
  public selectedCard: string | null = null;
  public isOffline: boolean = false;

  private hubConnection: signalR.HubConnection | null = null;
  private listeners: Set<() => void> = new Set();
  private healthCheckInterval: any = null;

  constructor(
    apiBaseUrl: string,
    roomId: string,
    participantName: string,
    participantRole: string,
    requestId: string | null = null
  ) {
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.hubUrl = `${this.apiBaseUrl}/hubs/room`;
    this.roomId = roomId;
    this.participantName = participantName;
    this.participantRole = participantRole;
    this.requestId = requestId;

    this.connectionState = this.isModerator() ? 'Connected' : 'WaitingForApproval';
  }

  public isModerator(): boolean {
    return this.participantRole === 'Moderator';
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }

  public async start(): Promise<void> {
    this.startHealthCheckTimer();

    // Check if the room exists and is active before connecting
    try {
      const res = await this.apiFetch(`v1/rooms/${this.roomId}/participants`);
      if (res.status === 404) {
        window.location.href = '/?error=memory_reset';
        return;
      }
    } catch (err) {
      this.setOffline(true);
      return;
    }

    await this.connectSignalR();
    if (this.connectionState === 'Connected') {
      await this.refreshData();
    }
    this.notify();
  }

  public destroy(): void {
    this.stopHealthCheckTimer();
    if (this.hubConnection) {
      this.hubConnection.stop();
    }
  }

  private async connectSignalR(): Promise<void> {
    try {
      this.hubConnection = new signalR.HubConnectionBuilder()
        .withUrl(this.hubUrl)
        .withAutomaticReconnect({
          nextRetryDelayInMilliseconds: () => 2000,
        })
        .build();

      this.hubConnection.onreconnecting(() => {
        this.setOffline(true);
      });

      this.hubConnection.onreconnected(async () => {
        this.setOffline(false);
        await this.rejoinHubChannels();
      });

      this.hubConnection.onclose(() => {
        this.checkBackendOffline();
        if (this.isModerator()) {
          window.location.href = '/?error=Session closed or connection lost';
        } else {
          this.connectionState = 'Disconnected';
          this.notify();
        }
      });

      // Register SignalR listeners
      this.hubConnection.on('OnParticipantConnectionStatusChanged', (name: string, isOnline: boolean) => {
        this.participantOnlineStatus.set(name, isOnline);
        this.notify();
      });

      this.hubConnection.on('OnJoinRequestReceived', (reqId: string, name: string, role: string) => {
        if (this.isModerator()) {
          // Prevent duplicates
          if (!this.pendingRequests.some((r) => r.requestId === reqId)) {
            this.pendingRequests.push({ requestId: reqId, name, role });
          }
          this.notify();
        }
      });

      this.hubConnection.on('OnJoinRequestApproved', async (reqId: string) => {
        if (!this.isModerator() && this.requestId === reqId) {
          this.connectionState = 'Connected';
        }
        if (this.connectionState === 'Connected') {
          await this.refreshData();
        }
        this.notify();
      });

      this.hubConnection.on('OnJoinRequestRejected', (reqId: string) => {
        if (!this.isModerator() && this.requestId === reqId) {
          this.connectionState = 'Rejected';
          this.notify();
        }
      });

      this.hubConnection.on('OnRoomClosed', () => {
        if (!this.isModerator()) {
          this.connectionState = 'Disconnected';
          this.notify();
        }
      });

      this.hubConnection.on('OnVoteCast', async (name: string) => {
        this.votedParticipants.add(name);
        await this.fetchSession();
        this.notify();
      });

      this.hubConnection.on('OnVotesRevealed', (dto: EstimationSessionDto) => {
        this.currentSession = dto;
        this.selectedCard = null;
        this.notify();
      });

      this.hubConnection.on('OnSessionHalted', (reason: string) => {
        if (this.currentSession) {
          this.currentSession = { ...this.currentSession, currentState: 'Halted' };
        }
        this.notify();
      });

      this.hubConnection.on('OnVotesRestarted', async () => {
        this.votedParticipants.clear();
        this.selectedCard = null;
        await this.fetchSession();
        this.notify();
      });

      this.hubConnection.on('OnSessionUpdated', async () => {
        await this.refreshData();
        this.notify();
      });

      await this.hubConnection.start();
      this.setOffline(false);
      await this.rejoinHubChannels();
    } catch (err) {
      console.error('SignalR start failed:', err);
      this.setOffline(true);
    }
  }

  private async rejoinHubChannels(): Promise<void> {
    if (!this.hubConnection) return;
    try {
      if (this.isModerator()) {
        await this.hubConnection.invoke('JoinRoomAsModerator', this.roomId);
      } else {
        await this.hubConnection.invoke('JoinRoomAsParticipantWithName', this.roomId, this.participantName);
      }
    } catch (err) {
      console.error('Rejoining hub channels failed:', err);
    }
  }

  private setOffline(offline: boolean): void {
    if (this.isOffline !== offline) {
      this.isOffline = offline;
      this.notify();
      if (offline) {
        window.location.href = '/?error=Connection to backend was lost';
        return;
      }
      if (!offline && this.connectionState === 'Connected') {
        this.refreshData();
      }
    }
  }

  public async checkBackendOffline(): Promise<void> {
    try {
      // Ping health endpoint with low timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      
      const res = await fetch(`${this.apiBaseUrl}/health`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // If we got a response back (even 404 or 500), the server is online
      this.setOffline(false);
    } catch (err) {
      this.setOffline(true);
    }
  }

  private startHealthCheckTimer(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.checkBackendOffline();
      if (!this.isOffline) {
        this.refreshData();
      }
    }, 5000);
  }

  private stopHealthCheckTimer(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }

  private async apiFetch(path: string, options?: RequestInit): Promise<Response> {
    try {
      const res = await fetch(`${this.apiBaseUrl}/${path}`, options);
      this.setOffline(false);
      return res;
    } catch (err) {
      this.setOffline(true);
      throw err;
    }
  }

  public async refreshData(): Promise<void> {
    if (this.isModerator()) {
      await Promise.all([this.fetchSession(), this.fetchParticipants(), this.fetchPendingRequests()]);
    } else {
      await Promise.all([this.fetchSession(), this.fetchParticipants()]);
    }
  }

  public async fetchSession(): Promise<void> {
    try {
      const res = await this.apiFetch(`v1/rooms/${this.roomId}/session`);
      if (res.status === 204) {
        this.currentSession = null;
        return;
      }
      if (res.status === 404) {
        // Room doesn't exist
        window.location.href = '/?error=memory_reset';
        return;
      }
      if (res.ok) {
        const session = await res.json() as EstimationSessionDto;
        this.currentSession = session;
        this.votedParticipants.clear();
        if (session.votes) {
          session.votes.forEach((v) => {
            this.votedParticipants.add(v.name);
          });
        }
        if (session.currentState === 'PrivateEstimation' && !this.votedParticipants.has(this.participantName)) {
          this.selectedCard = null;
        }
      }
    } catch (err) {
      console.error('Error fetching session:', err);
    }
  }

  public async fetchParticipants(): Promise<void> {
    try {
      const res = await this.apiFetch(`v1/rooms/${this.roomId}/participants`);
      if (res.status === 404) {
        window.location.href = '/?error=memory_reset';
        return;
      }
      if (res.ok) {
        const participants = await res.json() as ParticipantDto[];
        if (Array.isArray(participants)) {
          this.roomParticipants = participants;
          participants.forEach((p) => {
            if (!this.participantOnlineStatus.has(p.name)) {
              this.participantOnlineStatus.set(p.name, true);
            }
          });

          // For observers/voters, if they are approved, they are in the participants list
          if (!this.isModerator() && this.connectionState === 'WaitingForApproval') {
            const approved = participants.some((p) => p.name.toLowerCase() === this.participantName.toLowerCase());
            if (approved) {
              this.connectionState = 'Connected';
              await this.fetchSession();
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching participants:', err);
    }
  }

  public async fetchPendingRequests(): Promise<void> {
    if (!this.isModerator()) return;
    try {
      const res = await this.apiFetch(`v1/rooms/${this.roomId}/join-requests`);
      if (res.status === 404) {
        window.location.href = '/?error=memory_reset';
        return;
      }
      if (res.ok) {
        const requests = await res.json() as PendingRequestModel[];
        if (Array.isArray(requests)) {
          this.pendingRequests = requests;
        }
      }
    } catch (err) {
      console.error('Error fetching pending requests:', err);
    }
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

  public async joinRoom(participantName: string, role: string): Promise<{ requestId: string } | null> {
    const res = await this.apiFetch(`v1/rooms/${this.roomId}/join-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: participantName, role }),
    });
    if (res.ok) {
      return await res.json();
    }
    return null;
  }

  public async startSession(storyDescription: string): Promise<void> {
    await this.apiFetch(`v1/rooms/${this.roomId}/session/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storyDescription }),
    });
  }

  public async transitionToPrivate(): Promise<void> {
    const res = await this.apiFetch(`v1/rooms/${this.roomId}/session/transition/private`, {
      method: 'POST',
    });
    if (res.ok && this.hubConnection) {
      await this.hubConnection.invoke('RestartEstimation', this.roomId);
    }
  }

  public async transitionToConsensus(): Promise<void> {
    await this.apiFetch(`v1/rooms/${this.roomId}/session/transition/consensus`, {
      method: 'POST',
    });
  }

  public async castVote(card: string): Promise<void> {
    if (this.selectedCard === card) return;
    this.selectedCard = card;
    if (this.hubConnection) {
      await this.hubConnection.invoke('CastVote', this.roomId, this.participantName, card);
    }
    this.notify();
  }

  public async revealVotes(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.invoke('RevealVotes', this.roomId);
    }
  }

  public async restartVotes(): Promise<void> {
    const res = await this.apiFetch(`v1/rooms/${this.roomId}/session/transition/private`, {
      method: 'POST',
    });
    if (res.ok && this.hubConnection) {
      await this.hubConnection.invoke('RestartEstimation', this.roomId);
    }
  }

  public async closeSession(): Promise<void> {
    await this.apiFetch(`v1/rooms/${this.roomId}/session/close`, {
      method: 'POST',
    });
  }

  public async approveRequest(reqId: string): Promise<void> {
    const res = await this.apiFetch(`v1/rooms/${this.roomId}/join-requests/${reqId}/approve`, {
      method: 'POST',
    });
    if (res.ok) {
      this.pendingRequests = this.pendingRequests.filter((r) => r.requestId !== reqId);
      this.notify();
    }
  }

  public async rejectRequest(reqId: string): Promise<void> {
    const res = await this.apiFetch(`v1/rooms/${this.roomId}/join-requests/${reqId}/reject`, {
      method: 'POST',
    });
    if (res.ok) {
      this.pendingRequests = this.pendingRequests.filter((r) => r.requestId !== reqId);
      this.notify();
    }
  }
}
