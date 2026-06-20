import { RoomSession } from './roomSession';
import { marked } from 'marked';

export interface RoomDomElements {
  screenConnecting: HTMLElement;
  screenWaiting: HTMLElement;
  screenRejected: HTMLElement;
  screenDisconnected: HTMLElement;
  screenConnected: HTMLElement;
  roomCodeBadgeText: HTMLElement;
  btnCopyCode: HTMLButtonElement;
  userStoryDescription: HTMLElement;
  votingStateBadge: HTMLElement;
  moderatorPanel: HTMLElement;
  modStorySetup: HTMLElement;
  modSessionControls: HTMLElement;
  storyDescTextarea: HTMLTextAreaElement;
  btnStartSession: HTMLButtonElement;
  btnTransitionPrivate: HTMLButtonElement;
  btnRevealVotes: HTMLButtonElement;
  btnRestartVotes: HTMLButtonElement;
  btnCloseSession: HTMLButtonElement;
  deckPanel: HTMLElement;
  deckCards: NodeListOf<HTMLElement>;
  offlineBanner: HTMLElement;
  participantListItems: HTMLElement;
  pendingRequestsCard: HTMLElement;
  pendingRequestsItems: HTMLElement;
  pendingRequestsTitle: HTMLElement;
  revealResultsContainer: HTMLElement;
}

export class RoomViewController {
  private elements: RoomDomElements;
  private session: RoomSession;

  constructor(elements: RoomDomElements, session: RoomSession) {
    this.elements = elements;
    this.session = session;

    this.attachEventListeners();
    this.session.subscribe(() => this.updateUI());
  }

  private attachEventListeners(): void {
    // 1. Deck Cards Click
    this.elements.deckCards.forEach((card) => {
      card.addEventListener('click', () => {
        const cardValue = card.getAttribute('data-card');
        if (cardValue) {
          this.session.castVote(cardValue);
        }
      });
    });

    // 2. Copy Room Code Button
    this.elements.btnCopyCode?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.session.roomId);
        const originalText = this.elements.btnCopyCode.innerText;
        this.elements.btnCopyCode.innerText = 'Copied!';
        setTimeout(() => {
          this.elements.btnCopyCode.innerText = originalText;
        }, 2000);
      } catch (err) {
        console.error('Copy failed:', err);
      }
    });

    // 3. Start Session Button
    this.elements.btnStartSession?.addEventListener('click', () => {
      const desc = this.elements.storyDescTextarea.value.trim();
      if (desc) {
        this.session.startSession(desc);
        this.elements.storyDescTextarea.value = '';
      }
    });

    // 4. Transition Private Button
    this.elements.btnTransitionPrivate?.addEventListener('click', () => {
      this.session.transitionToPrivate();
    });

    // 5. Reveal Votes Button
    this.elements.btnRevealVotes?.addEventListener('click', () => {
      this.session.revealVotes();
    });

    // 6. Restart Votes Button
    this.elements.btnRestartVotes?.addEventListener('click', () => {
      this.session.restartVotes();
    });

    // 7. Close Session Button
    this.elements.btnCloseSession?.addEventListener('click', () => {
      this.session.closeSession();
    });

    // 8. Go Home Buttons
    document.querySelectorAll('.btn-go-home').forEach((btn) => {
      btn.addEventListener('click', () => {
        window.location.href = '/';
      });
    });
  }

  public updateUI(): void {
    // 1. Sync Offline Banner
    if (this.elements.offlineBanner) {
      this.elements.offlineBanner.style.display = this.session.isOffline ? 'block' : 'none';
    }

    // 2. Hide all screens first
    this.elements.screenConnecting.style.display = 'none';
    this.elements.screenWaiting.style.display = 'none';
    this.elements.screenRejected.style.display = 'none';
    this.elements.screenDisconnected.style.display = 'none';
    this.elements.screenConnected.style.display = 'none';

    // 3. Show correct screen
    if (this.session.connectionState === 'Connecting') {
      this.elements.screenConnecting.style.display = 'block';
      return;
    }
    if (this.session.connectionState === 'WaitingForApproval') {
      this.elements.screenWaiting.style.display = 'block';
      return;
    }
    if (this.session.connectionState === 'Rejected') {
      this.elements.screenRejected.style.display = 'block';
      return;
    }
    if (this.session.connectionState === 'Disconnected') {
      if (this.session.isModerator()) {
        window.location.href = '/?error=Session closed or connection lost';
        return;
      }
      this.elements.screenDisconnected.style.display = 'block';
      return;
    }

    // Connected state UI sync
    this.elements.screenConnected.style.display = 'flex';

    // Sync state badge
    if (this.elements.votingStateBadge) {
      const state = this.session.currentSession?.currentState ?? 'Not Started';
      this.elements.votingStateBadge.innerText = `Voting State: ${state}`;
      if (state === 'PrivateEstimation') {
        this.elements.votingStateBadge.classList.remove('inactive');
      } else {
        this.elements.votingStateBadge.classList.add('inactive');
      }
    }

    // Render User Story Description
    this.renderStoryDescription();

    // Sync Moderator Controls
    this.syncModeratorControls();

    // Sync Deck (Visible to Developer in PrivateEstimation state)
    this.syncDeckPanel();

    // Render Lists and Results using JS DOM methods
    this.renderParticipants();
    this.renderJoinRequests();
    this.renderResults();
  }

  private renderStoryDescription(): void {
    const desc = this.elements.userStoryDescription;
    const storyDesc = this.session.currentSession?.storyDescription;
    if (storyDesc) {
      desc.innerHTML = marked.parse(storyDesc) as string;
    } else {
      desc.innerHTML = '';
      const h2 = document.createElement('h2');
      h2.style.margin = '0';
      h2.style.fontSize = '1.5rem';
      h2.textContent = 'Waiting for story...';
      desc.appendChild(h2);
    }
  }

  private syncModeratorControls(): void {
    if (this.session.isModerator()) {
      this.elements.moderatorPanel.style.display = 'block';
      if (!this.session.currentSession) {
        this.elements.modStorySetup.style.display = 'block';
        this.elements.modSessionControls.style.display = 'none';
      } else {
        this.elements.modStorySetup.style.display = 'none';
        this.elements.modSessionControls.style.display = 'flex';

        const state = this.session.currentSession.currentState;
        this.elements.btnTransitionPrivate.style.display = state === 'StoryPresentation' ? 'block' : 'none';

        if (state === 'PrivateEstimation') {
          this.elements.btnRevealVotes.style.display = 'block';
          const developers = this.session.roomParticipants.filter(
            (p) => p.role.toLowerCase() === 'developer'
          );
          const allVoted =
            developers.length > 0 &&
            developers.every((dev) => this.session.votedParticipants.has(dev.name));
          this.elements.btnRevealVotes.disabled = !allVoted;
        } else {
          this.elements.btnRevealVotes.style.display = 'none';
        }

        const showEndedControls = ['SimultaneousReveal', 'ConsensusManagement', 'Halted'].includes(state);
        this.elements.btnRestartVotes.style.display = showEndedControls ? 'block' : 'none';
        this.elements.btnCloseSession.style.display = showEndedControls ? 'block' : 'none';
      }
    } else {
      this.elements.moderatorPanel.style.display = 'none';
    }
  }

  private syncDeckPanel(): void {
    const isVoter = this.session.participantRole === 'Developer';
    const isVotingOngoing = this.session.currentSession?.currentState === 'PrivateEstimation';
    if (isVoter && isVotingOngoing) {
      this.elements.deckPanel.style.display = 'block';
      this.elements.deckCards.forEach((card) => {
        const val = card.getAttribute('data-card');
        if (this.session.selectedCard === val) {
          card.classList.add('active-selected');
        } else {
          card.classList.remove('active-selected');
        }
      });
    } else {
      this.elements.deckPanel.style.display = 'none';
    }
  }

  private renderParticipants(): void {
    const container = this.elements.participantListItems;
    container.innerHTML = '';

    if (this.session.roomParticipants.length === 0) {
      const p = document.createElement('p');
      p.style.color = 'var(--text-gray-muted)';
      p.style.fontStyle = 'italic';
      p.style.margin = '0';
      p.style.textAlign = 'center';
      p.textContent = 'No participants in the room yet.';
      container.appendChild(p);
      return;
    }

    this.session.roomParticipants.forEach((p) => {
      const isOnline = this.session.participantOnlineStatus.get(p.name) !== false;
      const statusColor = isOnline ? '#6ab28f' : '#ef6f6f';

      const item = document.createElement('div');
      item.className = 'waiting-participant';
      item.style.marginBottom = '0';

      const leftCol = document.createElement('div');
      const nameRow = document.createElement('div');
      nameRow.style.fontWeight = '600';
      nameRow.style.display = 'flex';
      nameRow.style.alignItems = 'center';
      nameRow.style.gap = '6px';

      const statusDot = document.createElement('span');
      statusDot.style.width = '8px';
      statusDot.style.height = '8px';
      statusDot.style.borderRadius = '50%';
      statusDot.style.backgroundColor = statusColor;
      statusDot.style.display = 'inline-block';
      statusDot.title = isOnline ? 'Online' : 'Offline';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'participant-name-text';
      nameSpan.textContent = p.name;
      if (!isOnline) {
        nameSpan.style.color = 'var(--text-gray-muted)';
        nameSpan.style.textDecoration = 'line-through';
      } else {
        nameSpan.style.color = 'var(--text-white)';
      }

      nameRow.appendChild(statusDot);
      nameRow.appendChild(nameSpan);

      if (!isOnline) {
        const offlineSpan = document.createElement('span');
        offlineSpan.style.fontSize = '0.75rem';
        offlineSpan.style.color = '#ef6f6f';
        offlineSpan.style.fontWeight = 'normal';
        offlineSpan.style.marginLeft = '2px';
        offlineSpan.textContent = ' (Offline)';
        nameRow.appendChild(offlineSpan);
      }

      const roleDiv = document.createElement('div');
      roleDiv.style.fontSize = '0.75rem';
      roleDiv.style.color = 'var(--text-gray-muted)';
      roleDiv.textContent = p.role;

      leftCol.appendChild(nameRow);
      leftCol.appendChild(roleDiv);

      const rightCol = document.createElement('div');
      if (p.role === 'Developer') {
        if (this.session.currentSession) {
          const vote = this.session.currentSession.votes?.find(
            (v) => v.name.toLowerCase() === p.name.toLowerCase()
          );
          const state = this.session.currentSession.currentState;

          const voteSpan = document.createElement('span');
          if (['SimultaneousReveal', 'ConsensusManagement', 'Halted'].includes(state)) {
            voteSpan.style.fontFamily = 'var(--font-mono)';
            voteSpan.style.fontWeight = '700';
            voteSpan.style.color = '#6ab28f';
            voteSpan.textContent = vote?.card || 'Idle';
          } else {
            if (vote?.card || this.session.votedParticipants.has(p.name)) {
              voteSpan.style.color = '#6ab28f';
              voteSpan.textContent = '✓ Voted';
            } else {
              voteSpan.style.color = 'var(--text-gray-muted)';
              voteSpan.textContent = 'Thinking...';
            }
          }
          rightCol.appendChild(voteSpan);
        } else {
          const waitSpan = document.createElement('span');
          waitSpan.style.color = 'var(--text-gray-muted)';
          waitSpan.textContent = 'Waiting...';
          rightCol.appendChild(waitSpan);
        }
      } else {
        const observerSpan = document.createElement('span');
        observerSpan.className = 'participant-observer-text';
        observerSpan.style.color = 'var(--text-gray-muted)';
        observerSpan.style.fontStyle = 'italic';

        const fullSpan = document.createElement('span');
        fullSpan.className = 'obs-full';
        fullSpan.textContent = 'Observer';

        const shortSpan = document.createElement('span');
        shortSpan.className = 'obs-short';
        shortSpan.textContent = 'Obs.';

        observerSpan.appendChild(fullSpan);
        observerSpan.appendChild(shortSpan);
        rightCol.appendChild(observerSpan);
      }

      item.appendChild(leftCol);
      item.appendChild(rightCol);
      container.appendChild(item);
    });
  }

  private renderJoinRequests(): void {
    const card = this.elements.pendingRequestsCard;
    const container = this.elements.pendingRequestsItems;
    const title = this.elements.pendingRequestsTitle;

    if (!this.session.isModerator() || this.session.pendingRequests.length === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';
    title.textContent = `Pending Requests (${this.session.pendingRequests.length})`;
    container.innerHTML = '';

    this.session.pendingRequests.forEach((req) => {
      const item = document.createElement('div');
      item.className = 'waiting-participant';

      const infoDiv = document.createElement('div');
      const nameDiv = document.createElement('div');
      nameDiv.className = 'participant-name-text';
      nameDiv.style.fontWeight = '600';
      nameDiv.style.color = 'var(--text-white)';
      nameDiv.textContent = req.name;

      const roleDiv = document.createElement('div');
      roleDiv.style.fontSize = '0.75rem';
      roleDiv.style.color = 'var(--text-gray-muted)';
      roleDiv.textContent = `Requested: ${req.role}`;

      infoDiv.appendChild(nameDiv);
      infoDiv.appendChild(roleDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'pending-request-actions';

      const approveBtn = document.createElement('button');
      approveBtn.className = 'btn btn-sm';
      approveBtn.style.background = 'var(--text-white)';
      approveBtn.style.color = 'var(--bg-dark-obsidian)';
      approveBtn.style.fontFamily = 'var(--font-mono)';
      approveBtn.style.border = '1px solid var(--text-white)';
      approveBtn.style.padding = '4px 14px';
      approveBtn.style.fontSize = '0.75rem';
      approveBtn.style.fontWeight = '600';
      approveBtn.style.borderRadius = '20px';
      approveBtn.textContent = 'Approve';
      approveBtn.addEventListener('click', () => this.session.approveRequest(req.requestId));

      const rejectBtn = document.createElement('button');
      rejectBtn.className = 'btn btn-sm';
      rejectBtn.style.background = 'transparent';
      rejectBtn.style.color = '#ef6f6f';
      rejectBtn.style.fontFamily = 'var(--font-mono)';
      rejectBtn.style.border = '1px solid #ef6f6f';
      rejectBtn.style.padding = '4px 10px';
      rejectBtn.style.fontSize = '0.75rem';
      rejectBtn.style.fontWeight = '600';
      rejectBtn.style.borderRadius = '20px';
      rejectBtn.textContent = 'Reject';
      rejectBtn.addEventListener('click', () => this.session.rejectRequest(req.requestId));

      actionsDiv.appendChild(approveBtn);
      actionsDiv.appendChild(rejectBtn);

      item.appendChild(infoDiv);
      item.appendChild(actionsDiv);
      container.appendChild(item);
    });
  }

  private renderResults(): void {
    const container = this.elements.revealResultsContainer;
    const sessionData = this.session.currentSession;

    if (!sessionData || !['SimultaneousReveal', 'ConsensusManagement', 'Halted'].includes(sessionData.currentState)) {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';
    container.innerHTML = '';

    const borderClr = sessionData.currentState === 'Halted' ? '#ef6f6f' : (sessionData.hasDiscrepancy ? '#e2a54a' : '#6ab28f');

    const cardDiv = document.createElement('div');
    cardDiv.className = 'glow-card';
    cardDiv.style.borderColor = borderClr;

    const bodyDiv = document.createElement('div');
    bodyDiv.style.textAlign = 'center';
    bodyDiv.style.padding = '1rem 0';

    if (sessionData.currentState === 'Halted') {
      const axeLaunchers = sessionData.votes
        ?.filter((v) => v.card?.toLowerCase() === 'axe')
        .map((v) => v.name) || [];

      const iconSpan = document.createElement('span');
      iconSpan.style.fontSize = '3.5rem';
      iconSpan.style.display = 'block';
      iconSpan.style.marginBottom = '1rem';
      iconSpan.textContent = '🪓';

      const title = document.createElement('h3');
      title.style.color = '#ef6f6f';
      title.style.marginBottom = '0.5rem';
      title.textContent = 'Estimation Halted (Limit of 8 Exceeded)';

      const desc = document.createElement('p');
      desc.style.color = 'var(--text-gray-light)';
      desc.style.maxWidth = '500px';
      desc.style.margin = '0 auto';
      desc.style.marginBottom = '1rem';
      desc.textContent =
        'The Axe protocol has been triggered. This story is too complex or ambiguous. It must be split into smaller tasks before proceeding.';

      bodyDiv.appendChild(iconSpan);
      bodyDiv.appendChild(title);
      bodyDiv.appendChild(desc);

      if (axeLaunchers.length > 0) {
        const triggeredDiv = document.createElement('div');
        triggeredDiv.style.marginTop = '1.5rem';
        triggeredDiv.style.padding = '0.75rem 1.25rem';
        triggeredDiv.style.background = 'rgba(239, 111, 111, 0.05)';
        triggeredDiv.style.border = '1px solid rgba(239, 111, 111, 0.15)';
        triggeredDiv.style.borderRadius = '8px';
        triggeredDiv.style.display = 'inline-block';

        const label = document.createElement('span');
        label.style.color = '#ef6f6f';
        label.style.fontWeight = '600';
        label.style.fontSize = '0.95rem';
        label.textContent = '🪓 Triggered by: ';

        const nameSpan = document.createElement('span');
        nameSpan.style.color = 'var(--text-white)';
        nameSpan.style.fontWeight = '700';
        nameSpan.style.fontSize = '0.95rem';
        nameSpan.textContent = axeLaunchers.join(', ');

        triggeredDiv.appendChild(label);
        triggeredDiv.appendChild(nameSpan);
        bodyDiv.appendChild(triggeredDiv);
      }
    } else if (!sessionData.hasDiscrepancy && sessionData.consensusValue) {
      const iconSpan = document.createElement('span');
      iconSpan.style.fontSize = '3.5rem';
      iconSpan.style.display = 'block';
      iconSpan.style.marginBottom = '1.5rem';
      iconSpan.style.background = 'var(--gradient-brand)';
      iconSpan.style.webkitBackgroundClip = 'text';
      iconSpan.style.webkitTextFillColor = 'transparent';
      iconSpan.style.fontWeight = '800';
      iconSpan.textContent = sessionData.consensusValue;

      const title = document.createElement('h3');
      title.style.color = '#6ab28f';
      title.style.marginBottom = '0.5rem';
      title.textContent = 'Consensus Reached!';

      const desc = document.createElement('p');
      desc.style.color = 'var(--text-gray-light)';

      const strongVal = document.createElement('strong');
      strongVal.textContent = sessionData.consensusValue;

      desc.textContent = 'The team has agreed on an effort score of ';
      desc.appendChild(strongVal);
      desc.appendChild(document.createTextNode(' points.'));

      bodyDiv.appendChild(iconSpan);
      bodyDiv.appendChild(title);
      bodyDiv.appendChild(desc);
    } else {
      const iconSpan = document.createElement('span');
      iconSpan.style.fontSize = '3.5rem';
      iconSpan.style.display = 'block';
      iconSpan.style.marginBottom = '1rem';
      iconSpan.textContent = '⚖️';

      const title = document.createElement('h3');
      title.style.color = '#e2a54a';
      title.style.marginBottom = '0.5rem';
      title.textContent = 'Discrepancy Detected';

      const desc = document.createElement('p');
      desc.style.color = 'var(--text-gray-light)';
      desc.style.maxWidth = '500px';
      desc.style.margin = '0 auto';
      desc.style.marginBottom = '1rem';
      desc.textContent =
        'The votes do not match. The lowest and highest voters should explain their technical reasoning.';

      bodyDiv.appendChild(iconSpan);
      bodyDiv.appendChild(title);
      bodyDiv.appendChild(desc);

      if (this.session.isModerator()) {
        const consensusBtn = document.createElement('button');
        consensusBtn.className = 'btn-premium';
        consensusBtn.id = 'btn-transition-consensus';
        consensusBtn.style.marginTop = '0.5rem';
        consensusBtn.textContent = 'Move to Consensus Management';
        consensusBtn.addEventListener('click', () => this.session.transitionToConsensus());
        bodyDiv.appendChild(consensusBtn);
      }

      const dist = this.getVoteDistribution(sessionData);
      const totalVotes = sessionData.votes?.length || 1;

      const distCard = document.createElement('div');
      distCard.style.maxWidth = '400px';
      distCard.style.margin = '1.5rem auto 0 auto';
      distCard.style.textAlign = 'left';
      distCard.style.background = 'rgba(93, 82, 75, 0.03)';
      distCard.style.border = '1px solid var(--border-color)';
      distCard.style.borderRadius = '8px';
      distCard.style.padding = '1.25rem';

      const distTitle = document.createElement('h4');
      distTitle.style.fontSize = '0.9rem';
      distTitle.style.fontWeight = '600';
      distTitle.style.color = 'var(--text-white)';
      distTitle.style.marginTop = '0';
      distTitle.style.marginBottom = '1rem';
      distTitle.style.borderBottom = '1px solid var(--border-color)';
      distTitle.style.paddingBottom = '0.5rem';
      distTitle.textContent = 'Vote Distribution';
      distCard.appendChild(distTitle);

      Object.entries(dist).forEach(([card, count]) => {
        const percentage = Math.round((count / totalVotes) * 100);

        const distItem = document.createElement('div');
        distItem.style.marginBottom = '0.75rem';

        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.fontSize = '0.85rem';
        row.style.marginBottom = '0.25rem';

        const cardSpan = document.createElement('span');
        cardSpan.style.fontWeight = '600';
        cardSpan.style.color = 'var(--text-white)';
        cardSpan.textContent = `Card ${card}`;

        const countSpan = document.createElement('span');
        countSpan.style.color = 'var(--text-gray-muted)';
        countSpan.textContent = `${count} ${count === 1 ? 'vote' : 'votes'} (${percentage}%)`;

        row.appendChild(cardSpan);
        row.appendChild(countSpan);

        const progressBg = document.createElement('div');
        progressBg.style.height = '6px';
        progressBg.style.background = 'rgba(93, 82, 75, 0.05)';
        progressBg.style.borderRadius = '3px';
        progressBg.style.overflow = 'hidden';

        const progressBar = document.createElement('div');
        progressBar.style.height = '100%';
        progressBar.style.width = `${percentage}%`;
        progressBar.style.background = 'var(--gradient-brand)';
        progressBar.style.borderRadius = '3px';

        progressBg.appendChild(progressBar);

        distItem.appendChild(row);
        distItem.appendChild(progressBg);
        distCard.appendChild(distItem);
      });

      bodyDiv.appendChild(distCard);
    }

    cardDiv.appendChild(bodyDiv);

    if (sessionData.flaggedSpecialCards && sessionData.flaggedSpecialCards.length > 0) {
      const flaggedDiv = document.createElement('div');
      flaggedDiv.style.marginTop = '2rem';
      flaggedDiv.style.borderTop = '1px dashed var(--border-color)';
      flaggedDiv.style.paddingTop = '1.5rem';

      const fTitle = document.createElement('h4');
      fTitle.style.fontSize = '1rem';
      fTitle.style.marginBottom = '0.75rem';
      fTitle.style.textTransform = 'uppercase';
      fTitle.style.color = 'var(--text-gray-muted)';
      fTitle.style.letterSpacing = '0.05em';
      fTitle.textContent = 'Flagged Actions:';
      flaggedDiv.appendChild(fTitle);

      const badgeContainer = document.createElement('div');
      badgeContainer.className = 'd-flex gap-2 flex-wrap';

      sessionData.flaggedSpecialCards.forEach((sc) => {
        let label = sc;
        if (sc === 'Diagram') label = '🎨 Sketch Architecture (Diagram)';
        else if (sc === 'AI') label = '🤖 Candidates for AI Automation';
        else if (sc === 'Coffee Cup') label = '☕ Take a coffee break';
        else if (sc === 'Axe') label = '🪓 Axe Protocol (Too complex)';

        const badge = document.createElement('span');
        badge.style.background = 'rgba(93, 82, 75, 0.05)';
        badge.style.color = 'var(--text-white)';
        badge.style.border = '1px solid var(--border-color)';
        badge.style.padding = '6px 12px';
        badge.style.borderRadius = '20px';
        badge.style.fontSize = '0.85rem';
        badge.style.fontWeight = '600';
        badge.textContent = label;
        badgeContainer.appendChild(badge);
      });

      flaggedDiv.appendChild(badgeContainer);
      cardDiv.appendChild(flaggedDiv);
    }

    container.appendChild(cardDiv);
  }

  private getVoteDistribution(sessionData: any): Record<string, number> {
    const dist: Record<string, number> = {};
    if (!sessionData.votes) return dist;
    sessionData.votes.forEach((v: any) => {
      if (v.card) {
        dist[v.card] = (dist[v.card] || 0) + 1;
      }
    });
    return Object.fromEntries(
      Object.entries(dist).sort((a, b) => b[1] - a[1])
    );
  }
}
