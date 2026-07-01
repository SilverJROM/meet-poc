import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { TileComponent } from './tile.component';
import type { PeerState } from '../../services/peer-state';

function peer(overrides: Partial<PeerState> = {}): PeerState {
  return {
    id: 'peer-1',
    participantId: 'participant-1',
    name: 'Ari Silver',
    stream: null,
    pc: null,
    connectionState: 'connected',
    isLocal: true,
    isHost: false,
    micEnabled: true,
    camEnabled: false,
    screenOn: false,
    reconnecting: false,
    isMobile: false,
    quality: 'good',
    audioOnlyReason: null,
    ...overrides,
  };
}

async function renderTile(state: PeerState): Promise<ComponentFixture<TileComponent>> {
  await TestBed.configureTestingModule({
    imports: [TileComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(TileComponent);
  fixture.componentRef.setInput('peer', state);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('TileComponent camera-off background avatar', () => {
  it('renders local image background with initials chip when camera is off', async () => {
    const fixture = await renderTile(
      peer({
        name: 'Ari Silver',
        background: { kind: 'image', id: 'account-bg' },
        backgroundImageUrl: '/assets/backgrounds/account-bg.svg',
      }),
    );

    const avatar = fixture.nativeElement.querySelector('.camera-off-avatar.has-bg-image') as HTMLElement | null;
    const chip = fixture.nativeElement.querySelector('.initials-chip') as HTMLElement | null;

    expect(avatar).not.toBeNull();
    expect(avatar?.style.backgroundImage).toContain('/assets/backgrounds/account-bg.svg');
    expect(chip?.textContent?.trim()).toBe('AS');
    expect(fixture.nativeElement.querySelector('.avatar-initials')).toBeNull();
  });

  it('renders a relayed built-in image background descriptor for remote camera-off peers', async () => {
    const fixture = await renderTile(
      peer({
        id: 'remote-1',
        participantId: 'remote-participant-1',
        name: 'Bela Cruz',
        isLocal: false,
        background: { kind: 'image', id: 'city' },
        backgroundImageUrl: null,
      }),
    );

    const avatar = fixture.nativeElement.querySelector('.camera-off-avatar.has-bg-image') as HTMLElement | null;
    const chip = fixture.nativeElement.querySelector('.initials-chip') as HTMLElement | null;

    expect(avatar).not.toBeNull();
    expect(avatar?.style.backgroundImage).toContain('/assets/backgrounds/city.svg');
    expect(chip?.textContent?.trim()).toBe('BC');
  });

  it('renders a remote peer\'s custom/account background image (R8b) instead of falling back to initials', async () => {
    const fixture = await renderTile(
      peer({
        id: 'remote-2',
        participantId: 'remote-participant-2',
        name: 'Dee Rivera',
        isLocal: false,
        background: { kind: 'image', id: 'acct:custom-1' },
        backgroundImageUrl: 'data:image/jpeg;base64,AAAA',
      }),
    );

    const avatar = fixture.nativeElement.querySelector('.camera-off-avatar.has-bg-image') as HTMLElement | null;

    expect(avatar).not.toBeNull();
    expect(avatar?.style.backgroundImage).toContain('data:image/jpeg;base64,AAAA');
    expect(fixture.nativeElement.querySelector('.avatar-initials')).toBeNull();
  });
});
