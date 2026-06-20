import { RoomApiService, type EstimationSessionDto, type ParticipantDto, type PendingRequestModel } from './services/roomApiService';
import { RoomSignalRService } from './services/roomSignalRService';

export type ConnectionState = 'Connecting' | 'WaitingForApproval' | 'Rejected' | 'Connected' | 'Disconnected';

export class RoomSession {
  public apiBaseUrl: string;
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

  private apiService: RoomApiService;
  private signalRService: RoomSignalRService;
  private listeners: Set<() => void> = new Set();
  private healthCheckInterval: any = null;

  constructor(
    apiBaseUrl: string,
    roomId: string,
    participantName: string,
    participantRole: string,
    requestId: string | null = null
  ) {
    this.apiBaseUrl = apiBaseUrl;
    this.roomId = roomId;
    this.participantName = participantName;
    this.participantRole = participantRole;
    this.requestId = requestId;

    this.apiService = new RoomApiService(apiBaseUrl, (offline) => this.setOffline(offline));
    this.signalRService = new RoomSignalRService(apiBaseUrl);

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

    try {
      const res = await this.apiService.fetchParticipants(this.roomId);
      if (res === 'memory_reset') {
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
    this.signalRService.disconnect().catch((err) => console.error('Error disconnecting SignalR:', err));
  }

  private async connectSignalR(): Promise<void> {
    try {
      await this.signalRService.connect({
        onReconnecting: () => {
          this.setOffline(true);
        },
        onReconnected: async () => {
          this.setOffline(false);
          await this.rejoinHubChannels();
        },
        onClose: () => {
          this.checkBackendOffline();
          if (this.isModerator()) {
            window.location.href = '/?error=Session closed or connection lost';
          } else {
            this.connectionState = 'Disconnected';
            this.notify();
          }
        },
        onParticipantConnectionStatusChanged: (name: string, isOnline: boolean) => {
          this.participantOnlineStatus.set(name, isOnline);
          this.notify();
        },
        onJoinRequestReceived: (reqId: string, name: string, role: string) => {
          if (this.isModerator()) {
            if (!this.pendingRequests.some((r) => r.requestId === reqId)) {
              this.pendingRequests.push({ requestId: reqId, name, role });
            }
            this.notify();
          }
        },
        onJoinRequestApproved: async (reqId: string) => {
          if (!this.isModerator() && this.requestId === reqId) {
            this.connectionState = 'Connected';
          }
          if (this.connectionState === 'Connected') {
            await this.refreshData();
          }
          this.notify();
        },
        onJoinRequestRejected: (reqId: string) => {
          if (!this.isModerator() && this.requestId === reqId) {
            this.connectionState = 'Rejected';
            this.notify();
          }
        },
        onRoomClosed: () => {
          if (!this.isModerator()) {
            this.connectionState = 'Disconnected';
            this.notify();
          }
        },
        onVoteCast: async (name: string) => {
          this.votedParticipants.add(name);
          await this.fetchSession();
          this.notify();
        },
        onVotesRevealed: (dto: EstimationSessionDto) => {
          this.currentSession = dto;
          this.selectedCard = null;
          this.notify();
        },
        onSessionHalted: (reason: string) => {
          if (this.currentSession) {
            this.currentSession = { ...this.currentSession, currentState: 'Halted' };
          }
          this.notify();
        },
        onVotesRestarted: async () => {
          this.votedParticipants.clear();
          this.selectedCard = null;
          await this.fetchSession();
          this.notify();
        },
        onSessionUpdated: async () => {
          await this.refreshData();
          this.notify();
        },
      });

      this.setOffline(false);
      await this.rejoinHubChannels();
    } catch (err) {
      console.error('SignalR start failed:', err);
      this.setOffline(true);
    }
  }

  private async rejoinHubChannels(): Promise<void> {
    try {
      if (this.isModerator()) {
        await this.signalRService.joinRoomAsModerator(this.roomId);
      } else {
        await this.signalRService.joinRoomAsParticipantWithName(this.roomId, this.participantName);
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
    await this.apiService.checkHealth();
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

  public async refreshData(): Promise<void> {
    if (this.isModerator()) {
      await Promise.all([this.fetchSession(), this.fetchParticipants(), this.fetchPendingRequests()]);
    } else {
      await Promise.all([this.fetchSession(), this.fetchParticipants()]);
    }
  }

  public async fetchSession(): Promise<void> {
    try {
      const session = await this.apiService.fetchSession(this.roomId);
      if (session === 'memory_reset') {
        window.location.href = '/?error=memory_reset';
        return;
      }
      if (session === null) {
        this.currentSession = null;
        return;
      }
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
    } catch (err) {
      console.error('Error fetching session:', err);
    }
  }

  public async fetchParticipants(): Promise<void> {
    try {
      const participants = await this.apiService.fetchParticipants(this.roomId);
      if (participants === 'memory_reset') {
        window.location.href = '/?error=memory_reset';
        return;
      }
      if (Array.isArray(participants)) {
        this.roomParticipants = participants;
        participants.forEach((p) => {
          if (!this.participantOnlineStatus.has(p.name)) {
            this.participantOnlineStatus.set(p.name, true);
          }
        });

        if (!this.isModerator() && this.connectionState === 'WaitingForApproval') {
          const approved = participants.some((p) => p.name.toLowerCase() === this.participantName.toLowerCase());
          if (approved) {
            this.connectionState = 'Connected';
            await this.fetchSession();
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
      const requests = await this.apiService.fetchPendingRequests(this.roomId);
      if (requests === 'memory_reset') {
        window.location.href = '/?error=memory_reset';
        return;
      }
      if (Array.isArray(requests)) {
        this.pendingRequests = requests;
      }
    } catch (err) {
      console.error('Error fetching pending requests:', err);
    }
  }

  public async startSession(storyDescription: string): Promise<void> {
    await this.apiService.startSession(this.roomId, storyDescription);
  }

  public async transitionToPrivate(): Promise<void> {
    const success = await this.apiService.transitionToPrivate(this.roomId);
    if (success) {
      await this.signalRService.restartEstimation(this.roomId);
    }
  }

  public async transitionToConsensus(): Promise<void> {
    await this.apiService.transitionToConsensus(this.roomId);
  }

  public async castVote(card: string): Promise<void> {
    if (this.selectedCard === card) return;
    this.selectedCard = card;
    await this.signalRService.castVote(this.roomId, this.participantName, card);
    this.notify();
  }

  public async revealVotes(): Promise<void> {
    await this.signalRService.revealVotes(this.roomId);
  }

  public async restartVotes(): Promise<void> {
    const success = await this.apiService.transitionToPrivate(this.roomId);
    if (success) {
      await this.signalRService.restartEstimation(this.roomId);
    }
  }

  public async closeSession(): Promise<void> {
    await this.apiService.closeSession(this.roomId);
  }

  public async approveRequest(reqId: string): Promise<void> {
    const success = await this.apiService.approveRequest(this.roomId, reqId);
    if (success) {
      this.pendingRequests = this.pendingRequests.filter((r) => r.requestId !== reqId);
      this.notify();
    }
  }

  public async rejectRequest(reqId: string): Promise<void> {
    const success = await this.apiService.rejectRequest(this.roomId, reqId);
    if (success) {
      this.pendingRequests = this.pendingRequests.filter((r) => r.requestId !== reqId);
      this.notify();
    }
  }
}
export { type EstimationSessionDto, type ParticipantDto, type PendingRequestModel };
