import * as signalR from '@microsoft/signalr';

export interface SignalRCallbacks {
  onReconnecting: () => void;
  onReconnected: () => Promise<void>;
  onClose: () => void;
  onParticipantConnectionStatusChanged: (name: string, isOnline: boolean) => void;
  onJoinRequestReceived: (reqId: string, name: string, role: string) => void;
  onJoinRequestApproved: (reqId: string) => Promise<void>;
  onJoinRequestRejected: (reqId: string) => void;
  onRoomClosed: () => void;
  onVoteCast: (name: string) => Promise<void>;
  onVotesRevealed: (dto: any) => void;
  onSessionHalted: (reason: string) => void;
  onVotesRestarted: () => Promise<void>;
  onSessionUpdated: () => Promise<void>;
}

export class RoomSignalRService {
  private hubConnection: signalR.HubConnection | null = null;
  private hubUrl: string;

  constructor(apiBaseUrl: string) {
    this.hubUrl = `${apiBaseUrl.replace(/\/$/, '')}/hubs/room`;
  }

  public async connect(callbacks: SignalRCallbacks): Promise<void> {
    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(this.hubUrl)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: () => 2000,
      })
      .build();

    this.hubConnection.onreconnecting(callbacks.onReconnecting);
    this.hubConnection.onreconnected(callbacks.onReconnected);
    this.hubConnection.onclose(callbacks.onClose);

    this.hubConnection.on('OnParticipantConnectionStatusChanged', callbacks.onParticipantConnectionStatusChanged);
    this.hubConnection.on('OnJoinRequestReceived', callbacks.onJoinRequestReceived);
    this.hubConnection.on('OnJoinRequestApproved', callbacks.onJoinRequestApproved);
    this.hubConnection.on('OnJoinRequestRejected', callbacks.onJoinRequestRejected);
    this.hubConnection.on('OnRoomClosed', callbacks.onRoomClosed);
    this.hubConnection.on('OnVoteCast', callbacks.onVoteCast);
    this.hubConnection.on('OnVotesRevealed', callbacks.onVotesRevealed);
    this.hubConnection.on('OnSessionHalted', callbacks.onSessionHalted);
    this.hubConnection.on('OnVotesRestarted', callbacks.onVotesRestarted);
    this.hubConnection.on('OnSessionUpdated', callbacks.onSessionUpdated);

    await this.hubConnection.start();
  }

  public async disconnect(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.stop();
      this.hubConnection = null;
    }
  }

  public async joinRoomAsModerator(roomId: string): Promise<void> {
    if (!this.hubConnection) throw new Error('SignalR not connected');
    await this.hubConnection.invoke('JoinRoomAsModerator', roomId);
  }

  public async joinRoomAsParticipantWithName(roomId: string, name: string): Promise<void> {
    if (!this.hubConnection) throw new Error('SignalR not connected');
    await this.hubConnection.invoke('JoinRoomAsParticipantWithName', roomId, name);
  }

  public async castVote(roomId: string, participantName: string, card: string): Promise<void> {
    if (!this.hubConnection) throw new Error('SignalR not connected');
    await this.hubConnection.invoke('CastVote', roomId, participantName, card);
  }

  public async revealVotes(roomId: string): Promise<void> {
    if (!this.hubConnection) throw new Error('SignalR not connected');
    await this.hubConnection.invoke('RevealVotes', roomId);
  }

  public async restartEstimation(roomId: string): Promise<void> {
    if (!this.hubConnection) throw new Error('SignalR not connected');
    await this.hubConnection.invoke('RestartEstimation', roomId);
  }
}
