'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MicOff, Volume2, VolumeX, X } from 'lucide-react';
import { Avatar } from '@/components/ui/avatar';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/components/providers/ToastProvider';
import { cn } from '@/lib/utils';
import type { Socket } from 'socket.io-client';

export interface CallParticipantMeta {
  userId: string;
  user?: {
    _id: string;
    username: string;
    firstName: string;
    lastName: string;
    avatar: string;
  } | null;
  muted: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  remoteMutedByAdmin?: boolean;
}

export interface ActiveCallSnapshot {
  id: string;
  callUuid: string;
  chatId: string;
  chatType: 'direct' | 'group';
  initiatorId: string;
  audioOnly: boolean;
  status: string;
  participants: CallParticipantMeta[];
  signals?: Array<{
    id: string;
    fromUserId: string;
    toUserId: string;
    kind: 'offer' | 'answer' | 'ice';
    payload: unknown;
    createdAt?: string;
  }>;
}

interface VideoCallStageProps {
  chatId: string;
  chatType: 'direct' | 'group';
  audioOnly: boolean;
  currentUser: {
    id: string;
    username: string;
    firstName?: string;
    lastName?: string;
    avatar?: string;
  };
  isGroupAdmin?: boolean;
  socket: Socket | null;
  chatWindowVisible: boolean;
  minimized?: boolean;
  onToggleChatWindow: () => void;
  onToggleMinimize?: () => void;
  onExit: () => void;
}

/** Exact Grupo Pro `.toggle_push_to_talk > svg.non_active` from layouts/chat_page/middle.php */
function GrupoPttInactiveIcon({ className = 'size-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 470 470" fill="currentColor" className={className} aria-hidden="true">
      <g fillRule="evenodd">
        <g transform="translate(85.333333, 18.666667)">
          <path d="M206.413257,215.447893 L206.413257,130.666667 C206.413257,99.7915733 181.28835,74.6666667 150.413257,74.666667 C119.538163,74.6666667 94.4132566,99.7915733 94.4132566,130.666667 L94.4132566,250.096427 C84.0473899,241.401173 71.1085099,236.468907 57.5200299,236.468907 C41.3429632,236.468907 25.8116566,243.323093 14.9470166,255.281493 C-6.06205009,278.304853 -4.69501009,313.828267 17.6045099,335.429973 C17.6330966,335.45856 17.6435499,335.48992 17.6721366,335.518507 L112,426.666667 L320,426.666667 L320,250.666667 L206.413257,215.447893 Z M277.333333,384 C277.333333,384 128.393387,384 128,384 C128,384 53.2621099,313.552 45.9912832,306.927147 C37.7177899,299.39072 37.1202432,286.573013 44.6579499,278.29696 C52.1969366,270.023467 65.0146432,269.4272 73.2894166,276.963627 C78.8286166,282.010453 115.241417,312 115.241417,312 L131.74659,303.46624 L131.74659,130.666667 C131.74659,120.356693 140.104563,112 150.413257,112 C160.72323,112 169.079923,120.356693 169.079923,130.666667 L169.079923,248.541653 L277.333333,282.666667 L277.333333,384 Z M24.1438166,163.708373 C21.3728299,153.1328 19.7465899,142.098987 19.7465899,130.666667 C19.7465899,58.6250667 78.3612032,7.10542736e-15 150.413257,7.10542736e-15 C222.46531,7.10542736e-15 281.079923,58.6250667 281.079923,130.666667 C281.079923,142.098987 279.453683,153.1328 276.682697,163.708373 L236.211443,149.69792 C237.574643,143.552 238.413257,137.218773 238.413257,130.666667 C238.413257,82.1431467 198.936777,42.6666667 150.413257,42.6666667 C101.889737,42.6666667 62.4132566,82.1431467 62.4132566,130.666667 C62.4132566,137.218773 63.2518699,143.552 64.6150699,149.69792 L24.1438166,163.708373 Z" />
        </g>
      </g>
    </svg>
  );
}

/** Exact Grupo Pro `.toggle_push_to_talk > svg.active` from layouts/chat_page/middle.php */
function GrupoPttActiveIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} stroke="currentColor" strokeWidth="0.168" aria-hidden="true">
      <path d="M18.3569 1.61412C18.57 1.25893 19.0307 1.14376 19.3859 1.35687L19 1.99999C19.3859 1.35687 19.3855 1.35667 19.3859 1.35687L19.3873 1.35771L19.3888 1.35866L19.3925 1.36091L19.4021 1.36683C19.4095 1.3714 19.4187 1.37724 19.4297 1.38436C19.4517 1.39859 19.4808 1.41797 19.516 1.4426C19.5863 1.49182 19.6813 1.56232 19.7926 1.65508C20.0147 1.84016 20.3052 2.11666 20.5945 2.49271C21.1773 3.25044 21.75 4.40734 21.75 5.99999C21.75 7.59265 21.1773 8.74954 20.5945 9.50727C20.3052 9.88332 20.0147 10.1598 19.7926 10.3449C19.6813 10.4377 19.5863 10.5082 19.516 10.5574C19.4808 10.582 19.4517 10.6014 19.4297 10.6156C19.4187 10.6227 19.4095 10.6286 19.4021 10.6332L19.3925 10.6391L19.3888 10.6413L19.3873 10.6423C19.3869 10.6425 19.3859 10.6431 19 9.99999L19.3859 10.6431C19.0307 10.8562 18.57 10.741 18.3569 10.3859C18.1447 10.0322 18.258 9.57386 18.6097 9.35958L18.6152 9.35604C18.6225 9.35133 18.6363 9.34219 18.6558 9.32854C18.6949 9.30119 18.7562 9.25607 18.8324 9.19258C18.9853 9.06516 19.1948 8.86666 19.4055 8.59271C19.8227 8.05044 20.25 7.20734 20.25 5.99999C20.25 4.79264 19.8227 3.94954 19.4055 3.40727C19.1948 3.13332 18.9853 2.93482 18.8324 2.80741C18.7562 2.74391 18.6949 2.69879 18.6558 2.67145C18.6363 2.6578 18.6225 2.64866 18.6152 2.64394L18.6097 2.64041C18.258 2.42613 18.1447 1.96781 18.3569 1.61412Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M10 1.24999C7.37665 1.24999 5.25 3.37664 5.25 5.99999C5.25 8.62334 7.37665 10.75 10 10.75C12.6234 10.75 14.75 8.62334 14.75 5.99999C14.75 3.37664 12.6234 1.24999 10 1.24999ZM6.75 5.99999C6.75 4.20507 8.20507 2.74999 10 2.74999C11.7949 2.74999 13.25 4.20507 13.25 5.99999C13.25 7.79492 11.7949 9.24999 10 9.24999C8.20507 9.24999 6.75 7.79492 6.75 5.99999Z" fill="currentColor" />
      <path fillRule="evenodd" clipRule="evenodd" d="M10 12.25C7.96067 12.25 6.07752 12.7207 4.67815 13.5204C3.3 14.3079 2.25 15.5101 2.25 17C2.25 18.4899 3.3 19.6921 4.67815 20.4796C6.07752 21.2792 7.96067 21.75 10 21.75C12.0393 21.75 13.9225 21.2792 15.3219 20.4796C16.7 19.6921 17.75 18.4899 17.75 17C17.75 15.5101 16.7 14.3079 15.3219 13.5204C13.9225 12.7207 12.0393 12.25 10 12.25ZM3.75 17C3.75 16.2807 4.26701 15.4829 5.42236 14.8227C6.55649 14.1747 8.17334 13.75 10 13.75C11.8267 13.75 13.4435 14.1747 14.5776 14.8227C15.733 15.4829 16.25 16.2807 16.25 17C16.25 17.7193 15.733 18.517 14.5776 19.1772C13.4435 19.8253 11.8267 20.25 10 20.25C8.17334 20.25 6.55649 19.8253 5.42236 19.1772C4.26701 18.517 3.75 17.7193 3.75 17Z" fill="currentColor" />
      <path d="M17.3859 3.35687C17.0307 3.14376 16.57 3.25893 16.3569 3.61412L16.6051 4.63761L16.6129 4.64293C16.6246 4.65113 16.6468 4.66735 16.6761 4.69178C16.7353 4.74107 16.8198 4.82082 16.9055 4.93227C17.0727 5.14954 17.25 5.49264 17.25 5.99999C17.25 6.50734 17.0727 6.85044 16.9055 7.06771C16.8198 7.17916 16.7353 7.25891 16.6761 7.3082C16.6468 7.33263 16.6246 7.34885 16.6129 7.35705L16.6051 7.36237C16.257 7.57782 16.1456 8.0337 16.3569 8.38586C16.57 8.74105 17.0307 8.85622 17.3859 8.64311L17 7.99999C17.3859 8.64311 17.3855 8.64331 17.3859 8.64311L17.3872 8.6423L17.3887 8.64144L17.3918 8.63951L17.3993 8.63492L17.4185 8.6227C17.4332 8.61321 17.4515 8.60096 17.4731 8.5859C17.516 8.55582 17.572 8.51423 17.6364 8.46053C17.7647 8.35357 17.9302 8.19582 18.0945 7.98227C18.4273 7.54954 18.75 6.89264 18.75 5.99999C18.75 5.10734 18.4273 4.45044 18.0945 4.01771C17.9302 3.80416 17.7647 3.64641 17.6364 3.53945C17.572 3.48576 17.516 3.44416 17.4731 3.41408C17.4515 3.39902 17.4332 3.38678 17.4185 3.37728L17.3993 3.36507L17.3918 3.36047L17.3887 3.35855L17.3872 3.35768C17.3869 3.35748 17.3859 3.35687 17 3.99999L17.3859 3.35687Z" fill="currentColor" />
    </svg>
  );
}

/** Exact Grupo Pro video call dock SVG icons from layouts/chat_page/middle.php */
function GrupoLeaveCallIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91" />
      <line x1="23" y1="1" x2="1" y2="23" />
    </svg>
  );
}

function GrupoShareScreenIcon({ active, className = 'size-5' }: { active: boolean; className?: string }) {
  return active ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M13 3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2v-3" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M22 3l-5 5" />
      <path d="M17 3l5 5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M13 3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2v-3" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M17 8l5-5" />
      <path d="M17 3h5v5" />
    </svg>
  );
}

function GrupoDockMicIcon({ muted, className = 'size-5' }: { muted: boolean; className?: string }) {
  return muted ? (
    <svg viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M640 920h-88v-92.352c33.728-3.616 64.608-11.68 93.472-23.648l-2.24 0.832c14.4-6.24 24.288-20.352 24.288-36.768 0-22.080-17.888-39.968-39.968-39.968-5.568 0-10.88 1.152-15.712 3.2l0.256-0.096c-29.824 12.992-64.576 20.544-101.088 20.544-53.44 0-103.072-16.16-144.32-43.872l0.928 0.576c-83.904-63.36-137.6-162.944-137.6-275.072 0-9.056 0.352-18.016 1.024-26.912l-0.064 1.184c0-22.080-17.92-40-40-40s-40 17.92-40 40v0c-0.576 8.16-0.896 17.664-0.896 27.232 0 139.36 67.776 262.88 172.128 339.392l1.184 0.832c42.144 28.16 92.608 47.328 146.976 53.632l1.568 0.16v91.072h-88c-22.080 0-40 17.92-40 40s17.92 40 40 40v0h256c22.080 0 40-17.92 40-40s-17.92-40-40-40v0zM512 712c22.080 0 40-17.92 40-40s-17.92-40-40-40v0c-83.904-0.096-151.904-68.096-152-152v0c0-22.080-17.92-40-40-40s-40 17.92-40 40v0c0.128 128.064 103.936 231.872 232 232v0zM988.32 931.68l-219.136-219.136c63.648-76.672 102.304-176.096 102.304-284.544 0-7.168-0.16-14.272-0.512-21.344l0.032 0.992c0-22.080-17.92-40-40-40s-40 17.92-40 40v0c0.288 5.568 0.48 12.064 0.48 18.624 0 86.944-29.76 166.912-79.648 230.304l0.608-0.8-25.024-25.024c35.104-40.096 56.544-92.928 56.608-150.752v-224.032c0-0.16 0-0.384 0-0.576 0-127.808-103.616-231.424-231.424-231.424-117.6 0-214.688 87.712-229.472 201.248l-0.128 1.152-190.72-190.688c-7.232-7.2-17.184-11.616-28.192-11.616-22.080 0-40 17.92-40 40 0 11.008 4.448 20.96 11.616 28.192l895.968 896.032c7.232 7.232 17.248 11.712 28.288 11.712 22.112 0 40.032-17.92 40.032-40.032 0-11.040-4.48-21.056-11.712-28.288v0zM360 256c0-83.936 68.064-152 152-152s152 68.064 152 152v0 224c0 0.096 0 0.192 0 0.288 0 35.744-12.416 68.608-33.184 94.464l0.224-0.288-271.040-271.040z" />
    </svg>
  ) : (
    <svg viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M876.894 405.937c0-22.442-18.214-40.656-40.656-40.656s-40.656 18.214-40.656 40.656v0c0 240.227-147.499 349.672-284.59 349.672s-284.59-109.445-284.59-349.672c0-22.442-18.214-40.656-40.656-40.656s-40.656 18.214-40.656 40.656v0c-0.26 5.789-0.423 12.554-0.423 19.385 0 115.56 42.835 221.102 113.478 301.633l-0.455-0.52c54.544 58.089 128.83 97.086 212.093 106.29l1.529 0.13v93.801h-89.443c-22.442 0-40.656 18.214-40.656 40.656s18.214 40.656 40.656 40.656v0h260.197c22.442 0 40.656-18.214 40.656-40.656s-18.214-40.656-40.656-40.656v0h-89.443v-92.663c167.209-20.848 324.238-166.851 324.238-428.089zM512 715.279c130.163-0.13 235.673-105.64 235.803-235.803v-227.672c0-130.229-105.575-235.803-235.803-235.803s-235.803 105.575-235.803 235.803v0 227.672c0.13 130.163 105.64 235.673 235.803 235.803v0zM357.508 251.803c0-85.312 69.18-154.492 154.492-154.492s154.492 69.18 154.492 154.492v0 227.672c0 85.312-69.18 154.492-154.492 154.492s-154.492-69.18-154.492-154.492v0z" />
    </svg>
  );
}

function GrupoDockCamIcon({ off, className = 'size-5' }: { off: boolean; className?: string }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M21 20L16 20L8 20L7 20C5.11438 20 4.17157 20 3.58579 19.4142C3 18.8284 3 17.8856 3 16L3 9C3 7.89543 3.89543 7 5 7V7" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9.91501 10.8429C9.35081 11.3884 9 12.1532 9 12.9999C9 14.6568 10.3431 15.9999 12 15.9999C13.0435 15.9999 13.9625 15.4672 14.5 14.6588" stroke="currentColor" strokeWidth="2" />
      <path d="M3 5L21 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M21 16L21 9.60555C21 9.04256 21 8.76107 20.9437 8.52887C20.7673 7.801 20.199 7.2327 19.4711 7.05628C19.2389 7 18.9574 7 18.3944 7V7C18.079 7 17.9213 7 17.7739 6.9779C17.3177 6.90952 16.8991 6.6855 16.5891 6.34382C16.4889 6.23342 16.4015 6.1022 16.2265 5.83975L16 5.5C15.6036 4.90544 15.4054 4.60816 15.1345 4.40367C14.9691 4.27879 14.7852 4.18039 14.5895 4.112C14.2691 4 13.9118 4 13.1972 4L9.90139 4C9.33825 4 8.81237 4.28144 8.5 4.75V4.75L8.25 5.125" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M18.3944 7C18.9574 7 19.2389 7 19.4711 7.05628C20.199 7.2327 20.7673 7.801 20.9437 8.52887C21 8.76107 21 9.04256 21 9.60555L21 16C21 17.8856 21 18.8284 20.4142 19.4142C19.8284 20 18.8856 20 17 20L16 20L8 20L7 20C5.11438 20 4.17157 20 3.58579 19.4142C3 18.8284 3 17.8856 3 16L3 9.60555C3 9.04256 3 8.76107 3.05628 8.52887C3.23271 7.801 3.80101 7.2327 4.52887 7.05628C4.76107 7 5.04257 7 5.60555 7V7C5.92098 7 6.07869 7 6.2261 6.9779C6.68235 6.90952 7.10092 6.6855 7.4109 6.34382C7.51105 6.23342 7.59853 6.1022 7.7735 5.83975L8 5.5C8.39637 4.90544 8.59456 4.60816 8.86549 4.40367C9.03094 4.27879 9.2148 4.18039 9.41048 4.112C9.73092 4 10.0882 4 10.8028 4L13.1972 4C13.9118 4 14.2691 4 14.5895 4.112C14.7852 4.18039 14.9691 4.27879 15.1345 4.40367C15.4054 4.60816 15.6036 4.90544 16 5.5L16.2265 5.83975C16.4015 6.1022 16.4889 6.23342 16.5891 6.34382C16.8991 6.6855 17.3177 6.90952 17.7739 6.9779C17.9213 7 18.079 7 18.3944 7V7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M15 13C15 14.6569 13.6569 16 12 16C10.3431 16 9 14.6569 9 13C9 11.3431 10.3431 10 12 10C13.6569 10 15 11.3431 15 13Z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function GrupoToggleChatIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M8 10H16M8 14H16M21.0039 12C21.0039 16.9706 16.9745 21 12.0039 21C9.9675 21 3.00463 21 3.00463 21C3.00463 21 4.56382 17.2561 3.93982 16.0008C3.34076 14.7956 3.00391 13.4372 3.00391 12C3.00391 7.02944 7.03334 3 12.0039 3C16.9745 3 21.0039 7.02944 21.0039 12Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GrupoSettingsIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M18.48 18.5368H21M4.68 12L3 12.044M4.68 12C4.68 13.3255 5.75451 14.4 7.08 14.4C8.40548 14.4 9.48 13.3255 9.48 12C9.48 10.6745 8.40548 9.6 7.08 9.6C5.75451 9.6 4.68 10.6745 4.68 12ZM10.169 12.0441H21M12.801 5.55124L3 5.55124M21 5.55124H18.48M3 18.5368H12.801M17.88 18.6C17.88 19.9255 16.8055 21 15.48 21C14.1545 21 13.08 19.9255 13.08 18.6C13.08 17.2745 14.1545 16.2 15.48 16.2C16.8055 16.2 17.88 17.2745 17.88 18.6ZM17.88 5.4C17.88 6.72548 16.8055 7.8 15.48 7.8C14.1545 7.8 13.08 6.72548 13.08 5.4C13.08 4.07452 14.1545 3 15.48 3C16.8055 3 17.88 4.07452 17.88 5.4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Exact Grupo Pro `.vc_options` gear SVG from assets/js/chat_page/live_kit_video_chat.js */
function GrupoTileGearIcon({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" fill="currentColor" className={className} aria-hidden="true">
      <path d="M983.162 385.156l-111.835-13.828c-1.838-4.702-3.768-9.364-5.784-13.986l69.296-88.855c14.454-18.534 12.824-44.928-3.798-61.546l-114.055-113.991c-16.616-16.608-43.004-18.228-61.526-3.786l-88.823 69.268c-4.624-2.016-9.288-3.948-13.988-5.788l-13.83-111.807c-2.886-23.32-22.696-40.83-46.194-40.83h-161.273c-23.496 0-43.312 17.51-46.194 40.832l-13.828 111.807c-4.698 1.838-9.362 3.768-13.976 5.78l-88.829-69.284c-18.522-14.444-44.916-12.828-61.536 3.788l-114.041 114.017c-16.62 16.614-18.246 43.012-3.792 61.542l69.288 88.833c-2.024 4.624-3.956 9.294-5.8 14.004l-111.811 13.828c-23.318 2.888-40.832 22.698-40.832 46.196v161.279c0 23.5 17.516 43.316 40.842 46.194l111.801 13.806c1.838 4.704 3.768 9.372 5.788 13.988l-69.282 88.833c-14.448 18.528-12.822 44.92 3.788 61.534l114.041 114.061c16.614 16.62 43.014 18.242 61.546 3.792l88.833-69.296c4.612 2.014 9.276 3.948 13.974 5.782l13.828 111.841c2.882 23.32 22.696 40.832 46.194 40.832h161.273c23.496 0 43.31-17.51 46.194-40.832l13.83-111.839c4.702-1.84 9.364-3.77 13.986-5.784l88.849 69.3c18.532 14.45 44.926 12.828 61.542-3.796l114.029-114.061c16.614-16.616 18.234-43.008 3.786-61.536l-69.282-88.817c2.024-4.626 3.956-9.294 5.796-14.004l111.801-13.806c23.322-2.88 40.842-22.696 40.842-46.194v-161.279c-0.006-23.496-17.52-43.306-40.838-46.192zM930.905 551.477l-99.727 12.316c-18.302 2.262-33.544 15.112-38.862 32.772-5.626 18.674-13.12 36.774-22.276 53.806-8.734 16.248-7.050 36.126 4.294 50.67l61.796 79.226-55.848 55.864-79.242-61.81c-14.538-11.336-34.404-13.026-50.654-4.3-17.026 9.144-35.13 16.638-53.81 22.268-17.654 5.322-30.5 20.558-32.762 38.854l-12.338 99.765h-78.984l-12.334-99.765c-2.262-18.292-15.102-33.526-32.75-38.85-18.734-5.65-36.834-13.142-53.798-22.264-16.244-8.738-36.122-7.054-50.672 4.294l-79.23 61.804-55.854-55.87 61.794-79.236c11.342-14.546 13.026-34.412 4.294-50.656-9.136-17.002-16.63-35.108-22.274-53.822-5.324-17.65-20.564-30.494-38.86-32.752l-99.721-12.312v-78.984l99.731-12.334c18.292-2.262 33.526-15.102 38.846-32.75 5.648-18.712 13.144-36.812 22.286-53.8 8.748-16.248 7.066-36.134-4.286-50.684l-61.806-79.24 55.848-55.836 79.24 61.804c14.546 11.344 34.418 13.026 50.67 4.292 16.986-9.13 35.082-16.62 53.792-22.264 17.65-5.324 30.494-20.558 32.756-38.854l12.332-99.733h78.988l12.338 99.737c2.266 18.296 15.114 33.534 32.768 38.854 18.656 5.622 36.758 13.114 53.804 22.27 16.244 8.728 36.11 7.044 50.65-4.298l79.232-61.788 55.854 55.824-61.794 79.236c-11.332 14.534-13.026 34.382-4.316 50.622 9.16 17.080 16.656 35.198 22.276 53.846 5.322 17.65 20.558 30.496 38.854 32.762l99.755 12.338v78.978z" />
      <path d="M511.991 310.304c-111.211 0-201.689 90.487-201.689 201.711 0 111.205 90.477 201.677 201.689 201.677 111.217 0 201.703-90.471 201.703-201.677 0-111.223-90.485-201.711-201.703-201.711zM511.991 620.602c-59.882 0-108.599-48.712-108.599-108.587 0-59.894 48.718-108.621 108.599-108.621 59.888 0 108.611 48.726 108.611 108.621 0 59.876-48.724 108.587-108.611 108.587z" />
    </svg>
  );
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

function ParticipantMediaTile({
  stream,
  isLocal,
  displayName,
  avatar,
  audioOnly,
  muted,
  cameraEnabled,
  screenSharing,
  isSpeaking,
  isPinned,
  volume,
  onVolumeChange,
  onTogglePin,
  canAdminMute,
  onAdminRemoteMute,
}: {
  stream: MediaStream | null;
  isLocal: boolean;
  displayName: string;
  avatar?: string;
  audioOnly: boolean;
  muted: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  isSpeaking: boolean;
  isPinned: boolean;
  volume?: number;
  onVolumeChange?: (val: number) => void;
  onTogglePin: () => void;
  canAdminMute?: boolean;
  onAdminRemoteMute?: (nextMuted: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);

  const hasLiveVideo =
    !audioOnly &&
    Boolean(stream) &&
    stream!.getVideoTracks().some((t) => t.readyState === 'live' && t.enabled) &&
    (cameraEnabled || screenSharing);

  useEffect(() => {
    const v = videoRef.current;
    if (v) {
      v.srcObject = stream || null;
      if (stream) {
        v.muted = isLocal;
        if (!isLocal && typeof volume === 'number') {
          v.volume = Math.max(0, Math.min(1, volume / 100));
        }
        v.play().catch(() => undefined);
      }
    }
    const a = audioRef.current;
    if (a && !isLocal) {
      a.srcObject = stream || null;
      if (stream) {
        a.muted = false;
        if (typeof volume === 'number') {
          a.volume = Math.max(0, Math.min(1, volume / 100));
        }
        a.play().catch(() => undefined);
      }
    }

    return () => {
      if (v) v.srcObject = null;
      if (a) a.srcObject = null;
    };
  }, [stream, isLocal, volume, hasLiveVideo]);

  useEffect(() => {
    if (isLocal || typeof volume !== 'number') return;
    const normalized = Math.max(0, Math.min(1, volume / 100));
    if (videoRef.current) videoRef.current.volume = normalized;
    if (audioRef.current) audioRef.current.volume = normalized;
  }, [volume, isLocal]);

  return (
    <div
      className={cn(
        'relative rounded-[8px] overflow-hidden bg-[#1e1d1d] flex items-center justify-center group',
        isSpeaking
          ? 'border-2 border-[#26C6DA] shadow-[0_0_12px_rgba(38,198,218,0.5)]'
          : 'border border-white/15',
        isPinned ? 'w-full h-full min-h-[220px]' : 'w-full h-full min-h-[140px]'
      )}
    >
      {audioOnly && !isLocal && <audio ref={audioRef} autoPlay playsInline className="hidden" />}

      {hasLiveVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn(
            'w-full h-full bg-[#1e1d1d] block object-contain',
            isLocal && !screenSharing && 'scale-x-[-1]'
          )}
        />
      ) : (
        <div className="flex items-center justify-center p-4">
          {!audioOnly && !isLocal && <audio ref={audioRef} autoPlay playsInline className="hidden" />}
          {/* Exact Grupo Pro .participant_img 60px centered circular avatar */}
          <Avatar src={avatar} alt={displayName} size="lg" />
        </div>
      )}

      {/* Exact Grupo Pro .va_volume_control & .vc_options (hidden when spotlighted) */}
      {!isPinned && !isLocal && (
        <div className="absolute top-[11px] left-[10px] z-20 flex items-center gap-2">
          {typeof volume === 'number' && onVolumeChange && (
            <div className="group/vol flex items-center gap-1">
              <button
                type="button"
                onClick={() => onVolumeChange(volume === 0 ? 100 : 0)}
                className="text-[#bdbdbd] hover:text-white cursor-pointer"
                aria-label={volume === 0 ? 'Unmute participant volume' : 'Mute participant volume'}
              >
                {volume === 0 ? <VolumeX className="size-6 text-red-400" /> : <Volume2 className="size-6" />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                className="hidden group-hover/vol:block w-20 accent-white cursor-pointer"
                aria-label={`Volume for ${displayName}`}
              />
            </div>
          )}

          {canAdminMute && onAdminRemoteMute && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAdminMenuOpen((v) => !v)}
                className="text-[#bdbdbd] hover:text-white cursor-pointer flex items-center"
                aria-label="Participant options"
              >
                <GrupoTileGearIcon className="size-5" />
              </button>
              {adminMenuOpen && (
                <div className="absolute left-0 top-7 min-w-[85px] bg-[#292929] border border-black text-left text-[14px] text-[#c0c0c0] z-30 shadow-lg">
                  <button
                    type="button"
                    onClick={() => {
                      setAdminMenuOpen(false);
                      onAdminRemoteMute(!muted);
                    }}
                    className="w-full px-2.5 py-1.5 text-left hover:bg-[#1e1d1d] hover:text-white cursor-pointer"
                  >
                    {muted ? 'Unmute' : 'Mute'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Exact Grupo Pro .mute_symbol bottom-left badge when muted */}
      {muted && !isPinned && (
        <span
          className="absolute bottom-[15px] left-[15px] z-10 size-[30px] rounded-full bg-[#d40000] text-white flex items-center justify-center shadow"
          title="Muted"
        >
          <MicOff className="size-4" />
        </span>
      )}

      {/* Exact Grupo Pro .participant_name white top-right tag */}
      <button
        type="button"
        onClick={onTogglePin}
        title={isPinned ? 'Exit full view' : 'Expand participant'}
        className="absolute top-[15px] right-[15px] z-20 bg-white text-black text-[14px] leading-5 rounded-[5px] px-[6px] max-w-[70%] truncate cursor-pointer"
      >
        {displayName}
      </button>
    </div>
  );
}

/**
 * Full Grupo Pro Video Call + Audio Call + Screen Sharing Stage
 * (`layouts/chat_page/middle.php` + `live_kit_video_chat.js` + `agora_video_chat.js` parity)
 * backed by native WebRTC PeerConnection + dual Socket.IO / MongoDB signaling.
 */
export function VideoCallStage({
  chatId,
  chatType,
  audioOnly,
  currentUser,
  isGroupAdmin = false,
  socket,
  chatWindowVisible,
  onToggleChatWindow,
  onExit,
}: VideoCallStageProps) {
  const { error, info } = useToast();

  const [callId, setCallId] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [micMuted, setMicMuted] = useState(chatType === 'group');
  const [cameraOff, setCameraOff] = useState(audioOnly);
  const [screenSharing, setScreenSharing] = useState(false);
  const [pushToTalkMode, setPushToTalkMode] = useState(chatType === 'group');
  const [pttActive, setPttActive] = useState(false);
  const [pttLocked, setPttLocked] = useState(false);
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [videoInputs, setVideoInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [selectedCamId, setSelectedCamId] = useState<string>('');
  const [participants, setParticipants] = useState<CallParticipantMeta[]>([]);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [remoteVolumes, setRemoteVolumes] = useState<Record<string, number>>({});
  const [speakingUsers, setSpeakingUsers] = useState<Set<string>>(new Set());

  const callIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const processedSignalIdsRef = useRef<Set<string>>(new Set());
  const lastSignalIsoRef = useRef<string>('');
  const mountedRef = useRef(true);
  const exitedRef = useRef(false);
  const pttLockedRef = useRef<boolean>(false);
  const pttActiveRef = useRef<boolean>(false);
  const pttLastTapRef = useRef<number>(0);
  const pttTouchActiveRef = useRef<boolean>(false);
  const pttKeyHeldRef = useRef<boolean>(false);
  const onExitRef = useRef(onExit);

  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const sendSignal = useCallback(
    async (toUserId: string, kind: 'offer' | 'answer' | 'ice', payload: unknown) => {
      const activeCallId = callIdRef.current;
      if (!activeCallId) return;
      socket?.emit('chat:call:signal', {
        chatId,
        callId: activeCallId,
        toUserId,
        kind,
        payload,
      });
      await apiFetch(`/chats/${chatId}/call`, {
        method: 'POST',
        json: {
          action: 'signal',
          callId: activeCallId,
          toUserId,
          kind,
          payload,
        },
      }).catch(() => undefined);
    },
    [chatId, socket]
  );

  const pushStateUpdate = useCallback(
    async (patch: { muted?: boolean; cameraEnabled?: boolean; screenSharing?: boolean }) => {
      const activeCallId = callIdRef.current;
      if (!activeCallId) return;
      socket?.emit('chat:call:state', {
        chatId,
        callId: activeCallId,
        ...patch,
      });
      await apiFetch(`/chats/${chatId}/call`, {
        method: 'POST',
        json: {
          action: 'state',
          callId: activeCallId,
          ...patch,
        },
      }).catch(() => undefined);
    },
    [chatId, socket]
  );

  const getOrCreatePeer = useCallback(
    (peerUserId: string) => {
      const existing = peersRef.current.get(peerUserId);
      if (existing) return existing;

      const pc = new RTCPeerConnection(ICE_SERVERS);
      const local = localStreamRef.current;
      if (local) {
        local.getTracks().forEach((track) => {
          pc.addTrack(track, local);
        });
      }

      const inboundStream = new MediaStream();
      pc.ontrack = (ev) => {
        if (ev.streams && ev.streams[0]) {
          setRemoteStreams((prev) => ({ ...prev, [peerUserId]: ev.streams[0] }));
        } else if (ev.track) {
          inboundStream.addTrack(ev.track);
          setRemoteStreams((prev) => ({ ...prev, [peerUserId]: inboundStream }));
        }
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          void sendSignal(peerUserId, 'ice', ev.candidate.toJSON());
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peersRef.current.delete(peerUserId);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[peerUserId];
            return next;
          });
        }
      };

      peersRef.current.set(peerUserId, pc);
      return pc;
    },
    [sendSignal]
  );

  const handleIncomingSignal = useCallback(
    async (signal: {
      id?: string;
      fromUserId: string;
      kind: 'offer' | 'answer' | 'ice';
      payload: unknown;
    }) => {
      if (!signal?.fromUserId || signal.fromUserId === currentUser.id) return;
      if (signal.id && processedSignalIdsRef.current.has(signal.id)) return;
      if (signal.id) processedSignalIdsRef.current.add(signal.id);

      const pc = getOrCreatePeer(signal.fromUserId);
      try {
        if (signal.kind === 'offer') {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal(signal.fromUserId, 'answer', answer);
        } else if (signal.kind === 'answer') {
          if (pc.signalingState !== 'stable') {
            await pc.setRemoteDescription(
              new RTCSessionDescription(signal.payload as RTCSessionDescriptionInit)
            );
          }
        } else if (signal.kind === 'ice') {
          await pc.addIceCandidate(new RTCIceCandidate(signal.payload as RTCIceCandidateInit));
        }
      } catch {
        // Ignore transient race conditions on ICE before remote description
      }
    },
    [currentUser.id, getOrCreatePeer, sendSignal]
  );

  const syncPeersWithParticipants = useCallback(
    async (list: CallParticipantMeta[]) => {
      const remoteIds = new Set(
        list.map((p) => p.userId).filter((id) => id && id !== currentUser.id)
      );

      // Clean up peers who left
      for (const [uid, pc] of peersRef.current.entries()) {
        if (!remoteIds.has(uid)) {
          pc.close();
          peersRef.current.delete(uid);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[uid];
            return next;
          });
        }
      }

      // Deterministic caller-offer rule to prevent WebRTC offer glare
      for (const uid of remoteIds) {
        if (!peersRef.current.has(uid)) {
          const pc = getOrCreatePeer(uid);
          if (currentUser.id < uid) {
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await sendSignal(uid, 'offer', offer);
            } catch {
              // Ignore
            }
          }
        }
      }
    },
    [currentUser.id, getOrCreatePeer, sendSignal]
  );

  const stopAllMediaSync = useCallback(() => {
    screenStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    screenStreamRef.current = null;

    localStreamRef.current?.getTracks().forEach((t) => {
      try {
        t.stop();
      } catch {
        // ignore
      }
    });
    localStreamRef.current = null;

    for (const pc of peersRef.current.values()) {
      pc.getSenders().forEach((sender) => {
        if (sender.track) {
          try {
            sender.track.stop();
          } catch {
            // ignore
          }
        }
      });
      pc.close();
    }
    peersRef.current.clear();
    setLocalStream(null);
    setRemoteStreams({});
  }, []);

  const cleanupCall = useCallback(
    async (notifyServer = true) => {
      const leavingCallId = callIdRef.current;
      callIdRef.current = null;

      // Immediately release hardware camera & microphone BEFORE network I/O
      stopAllMediaSync();
      pttLockedRef.current = false;
      pttActiveRef.current = false;
      setPttLocked(false);
      setPttActive(false);

      if (notifyServer) {
        await apiFetch(`/chats/${chatId}/call`, {
          method: 'POST',
          json: { action: 'leave', callId: leavingCallId || undefined },
          keepalive: true,
        }).catch(() => undefined);
      }
    },
    [chatId, stopAllMediaSync]
  );

  const handleHangup = useCallback(() => {
    if (exitedRef.current) return;
    exitedRef.current = true;
    const leavingCallId = callIdRef.current;
    callIdRef.current = null;

    // Instant hardware camera/mic cut at 0ms
    stopAllMediaSync();
    onExitRef.current();

    void apiFetch(`/chats/${chatId}/call`, {
      method: 'POST',
      json: { action: 'leave', callId: leavingCallId || undefined },
      keepalive: true,
    }).catch(() => undefined);
  }, [chatId, stopAllMediaSync]);

  // Initialize local media, join/start call, and enumerate audio/video devices
  useEffect(() => {
    mountedRef.current = true;
    exitedRef.current = false;
    let initStopped = false;

    async function init() {
      try {
        if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
          throw new Error('Camera and microphone access requires HTTPS.');
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
            video: audioOnly ? false : { facingMode: 'user' },
          });
        } catch {
          // Graceful fallback to audio-only if webcam isn't attached
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          if (mountedRef.current && !initStopped) {
            setCameraOff(true);
          }
        }

        if (initStopped || !mountedRef.current || exitedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        // In group calls, start with PTT muted by default (Grupo mute_users_during_call/PTT parity)
        const startMuted = chatType === 'group';
        stream.getAudioTracks().forEach((t) => {
          t.enabled = !startMuted;
        });

        localStreamRef.current = stream;
        setLocalStream(stream);
        setMicMuted(startMuted);
        setPushToTalkMode(chatType === 'group');

        const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
        if (initStopped || !mountedRef.current || exitedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          return;
        }

        const mics = devices.filter((d) => d.kind === 'audioinput');
        const cams = devices.filter((d) => d.kind === 'videoinput');
        setAudioInputs(mics);
        setVideoInputs(cams);
        const activeAudioTrack = stream.getAudioTracks()[0];
        const activeVideoTrack = stream.getVideoTracks()[0];
        if (activeAudioTrack) {
          setSelectedMicId(activeAudioTrack.getSettings().deviceId || mics[0]?.deviceId || '');
        }
        if (activeVideoTrack) {
          setSelectedCamId(activeVideoTrack.getSettings().deviceId || cams[0]?.deviceId || '');
        }

        const res = await apiFetch<{ activeCall: ActiveCallSnapshot | null }>(
          `/chats/${chatId}/call`,
          {
            method: 'POST',
            json: { action: 'start', audioOnly },
          }
        );

        if (initStopped || !mountedRef.current || exitedRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          localStreamRef.current = null;
          if (res.activeCall?.id) {
            void apiFetch(`/chats/${chatId}/call`, {
              method: 'POST',
              json: { action: 'leave', callId: res.activeCall.id },
              keepalive: true,
            }).catch(() => undefined);
          }
          return;
        }

        if (!res.activeCall) {
          throw new Error('Could not establish call room.');
        }

        callIdRef.current = res.activeCall.id;
        setCallId(res.activeCall.id);
        setParticipants(res.activeCall.participants || []);
        setConnecting(false);
        await syncPeersWithParticipants(res.activeCall.participants || []);
      } catch (err) {
        if (!mountedRef.current || exitedRef.current) return;
        error('Unable to start call', err instanceof Error ? err.message : undefined);
        await cleanupCall(false);
        onExitRef.current();
      }
    }

    void init();

    return () => {
      initStopped = true;
      mountedRef.current = false;
      stopAllMediaSync();
      if (!exitedRef.current) {
        exitedRef.current = true;
        void cleanupCall(true);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId, audioOnly, chatType]);

  // Socket.IO realtime call signal & status listener
  useEffect(() => {
    if (!socket || !callId) return;

    const onSignal = (payload: {
      chatId?: string;
      fromUserId: string;
      kind: 'offer' | 'answer' | 'ice';
      payload: unknown;
    }) => {
      if (payload.chatId && payload.chatId !== chatId) return;
      void handleIncomingSignal(payload);
    };

    const onEnded = (payload: { chatId?: string; reason?: string }) => {
      if (payload.chatId && payload.chatId !== chatId) return;
      if (payload.reason === 'rejected') {
        info('Call declined');
      }
      void cleanupCall(false).then(() => onExitRef.current());
    };

    const onRemoteMute = (payload: { chatId?: string; muted?: boolean }) => {
      if (payload.chatId && payload.chatId !== chatId) return;
      const forceMuted = payload.muted !== false;
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = !forceMuted;
      });
      setMicMuted(forceMuted);
      info(forceMuted ? 'You were muted by a group admin' : 'Your microphone was enabled');
    };

    socket.on('chat:call:signal', onSignal);
    socket.on('chat:call:ended', onEnded);
    socket.on('chat:call:remote_mute', onRemoteMute);
    return () => {
      socket.off('chat:call:signal', onSignal);
      socket.off('chat:call:ended', onEnded);
      socket.off('chat:call:remote_mute', onRemoteMute);
    };
  }, [socket, callId, chatId, handleIncomingSignal, cleanupCall, info]);

  // Fast signaling & participant heartbeat polling (works on pure Vercel AND strengthens Socket.IO)
  useEffect(() => {
    if (!callId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const qs = lastSignalIsoRef.current
          ? `?after=${encodeURIComponent(lastSignalIsoRef.current)}`
          : '';
        const res = await apiFetch<{ activeCall: ActiveCallSnapshot | null }>(
          `/chats/${chatId}/call${qs}`
        );
        if (cancelled) return;
        const call = res.activeCall;
        if (!call) {
          await cleanupCall(false);
          onExitRef.current();
          return;
        }
        setParticipants(call.participants || []);

        const meRemote = call.participants.find((p) => p.userId === currentUser.id);
        if (meRemote?.remoteMutedByAdmin && !micMuted) {
          localStreamRef.current?.getAudioTracks().forEach((t) => {
            t.enabled = false;
          });
          setMicMuted(true);
        }

        await syncPeersWithParticipants(call.participants || []);

        if (call.signals && call.signals.length > 0) {
          for (const s of call.signals) {
            await handleIncomingSignal(s);
            if (s.createdAt) {
              lastSignalIsoRef.current = s.createdAt;
            }
          }
        }
      } catch {
        // ignore transient poll hiccup
      }
    };

    const interval = setInterval(() => void poll(), socket ? 3500 : 1200);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    callId,
    chatId,
    socket,
    currentUser.id,
    micMuted,
    cleanupCall,
    syncPeersWithParticipants,
    handleIncomingSignal,
  ]);

  // Active speaker audio level detector matching Grupo `activeSpeakersChanged`
  useEffect(() => {
    if (typeof window === 'undefined' || !localStream) return;
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioCtx();
    } catch {
      return;
    }

    const analysers: Array<{ userId: string; analyser: AnalyserNode; source: MediaStreamAudioSourceNode }> = [];
    const registerStream = (uid: string, stream: MediaStream) => {
      if (stream.getAudioTracks().length === 0 || !ctx) return;
      try {
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analysers.push({ userId: uid, analyser, source });
      } catch {
        // ignore
      }
    };

    registerStream(currentUser.id, localStream);
    for (const [uid, rStream] of Object.entries(remoteStreams)) {
      registerStream(uid, rStream);
    }

    const buf = new Uint8Array(128);
    const timer = setInterval(() => {
      const nextSpeaking = new Set<string>();
      for (const item of analysers) {
        item.analyser.getByteFrequencyData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i += 1) sum += buf[i];
        const avg = sum / buf.length;
        if (avg > 14 && (item.userId !== currentUser.id || !micMuted)) {
          nextSpeaking.add(item.userId);
        }
      }
      setSpeakingUsers(nextSpeaking);
    }, 350);

    return () => {
      clearInterval(timer);
      analysers.forEach((a) => a.source.disconnect());
      void ctx?.close().catch(() => undefined);
    };
  }, [localStream, remoteStreams, currentUser.id, micMuted]);

  const toggleMic = useCallback(
    (explicitState?: boolean) => {
      const stream = localStreamRef.current;
      if (!stream) return;
      const nextMuted = explicitState !== undefined ? explicitState : !micMuted;
      stream.getAudioTracks().forEach((t) => {
        t.enabled = !nextMuted;
      });
      setMicMuted(nextMuted);
      void pushStateUpdate({ muted: nextMuted });
    },
    [micMuted, pushStateUpdate]
  );

  async function toggleCamera() {
    if (audioOnly) return;
    const stream = localStreamRef.current;
    if (!stream) return;
    const videoTracks = stream.getVideoTracks();
    const nextOff = !cameraOff;

    if (nextOff) {
      // Stop hardware camera tracks immediately so the camera LED turns off right away
      videoTracks.forEach((t) => {
        stream.removeTrack(t);
        try {
          t.stop();
        } catch {
          // ignore
        }
      });
      for (const pc of peersRef.current.values()) {
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === 'video') {
            await sender.replaceTrack(null).catch(() => undefined);
          }
        }
      }
      setLocalStream(new MediaStream(stream.getTracks()));
      setCameraOff(true);
      void pushStateUpdate({ cameraEnabled: false });
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamId ? { deviceId: { exact: selectedCamId } } : { facingMode: 'user' },
      });
      const camTrack = camStream.getVideoTracks()[0];
      if (!camTrack) return;

      if (exitedRef.current || !mountedRef.current) {
        camTrack.stop();
        return;
      }

      stream.getVideoTracks().forEach((t) => {
        stream.removeTrack(t);
        t.stop();
      });
      stream.addTrack(camTrack);

      for (const pc of peersRef.current.values()) {
        const videoSender = pc.getSenders().find((s) => s.track === null || s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(camTrack).catch(() => undefined);
        } else {
          pc.addTrack(camTrack, stream);
        }
      }
      setLocalStream(new MediaStream(stream.getTracks()));
      setCameraOff(false);
      void pushStateUpdate({ cameraEnabled: true });
    } catch {
      error('Camera access unavailable');
    }
  }

  const stopScreenShare = useCallback(async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setScreenSharing(false);

    if (audioOnly) {
      for (const pc of peersRef.current.values()) {
        for (const sender of pc.getSenders()) {
          if (sender.track?.kind === 'video') {
            await sender.replaceTrack(null).catch(() => undefined);
          }
        }
      }
      setCameraOff(true);
      void pushStateUpdate({ screenSharing: false, cameraEnabled: false });
      return;
    }

    try {
      const camStream = await navigator.mediaDevices.getUserMedia({
        video: selectedCamId ? { deviceId: { exact: selectedCamId } } : { facingMode: 'user' },
      });
      const camTrack = camStream.getVideoTracks()[0];
      const baseStream = localStreamRef.current;
      if (camTrack && baseStream) {
        baseStream.getVideoTracks().forEach((t) => {
          baseStream.removeTrack(t);
          t.stop();
        });
        baseStream.addTrack(camTrack);
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) {
            await sender.replaceTrack(camTrack);
          } else {
            pc.addTrack(camTrack, baseStream);
          }
        }
        setLocalStream(new MediaStream(baseStream.getTracks()));
        setCameraOff(false);
        void pushStateUpdate({ screenSharing: false, cameraEnabled: true });
      }
    } catch {
      setCameraOff(true);
      void pushStateUpdate({ screenSharing: false, cameraEnabled: false });
    }
  }, [audioOnly, selectedCamId, pushStateUpdate]);

  async function startScreenShare() {
    if (!navigator.mediaDevices?.getDisplayMedia) {
      error('Screen sharing is not supported on this browser.');
      return;
    }
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) return;

      screenStreamRef.current = displayStream;
      const baseStream = localStreamRef.current || new MediaStream();
      baseStream.getVideoTracks().forEach((t) => {
        baseStream.removeTrack(t);
        t.stop();
      });
      baseStream.addTrack(screenTrack);
      localStreamRef.current = baseStream;

      for (const pc of peersRef.current.values()) {
        const videoSender = pc.getSenders().find((s) => s.track?.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        } else {
          pc.addTrack(screenTrack, baseStream);
        }
      }

      setLocalStream(new MediaStream(baseStream.getTracks()));
      setScreenSharing(true);
      setCameraOff(false);
      void pushStateUpdate({ screenSharing: true, cameraEnabled: true });

      screenTrack.onended = () => {
        void stopScreenShare();
      };
    } catch {
      // User cancelled screen share prompt
    }
  }

  async function switchDevice(kind: 'audio' | 'video', deviceId: string) {
    const baseStream = localStreamRef.current;
    if (!baseStream) return;
    try {
      if (kind === 'audio') {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });
        const nextTrack = nextStream.getAudioTracks()[0];
        if (!nextTrack) return;
        nextTrack.enabled = !micMuted;
        baseStream.getAudioTracks().forEach((t) => {
          baseStream.removeTrack(t);
          t.stop();
        });
        baseStream.addTrack(nextTrack);
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'audio');
          if (sender) await sender.replaceTrack(nextTrack);
        }
        setSelectedMicId(deviceId);
      } else {
        const nextStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        const nextTrack = nextStream.getVideoTracks()[0];
        if (!nextTrack) return;
        nextTrack.enabled = !cameraOff;
        baseStream.getVideoTracks().forEach((t) => {
          baseStream.removeTrack(t);
          t.stop();
        });
        baseStream.addTrack(nextTrack);
        for (const pc of peersRef.current.values()) {
          const sender = pc.getSenders().find((s) => s.track?.kind === 'video');
          if (sender) await sender.replaceTrack(nextTrack);
        }
        setSelectedCamId(deviceId);
        setScreenSharing(false);
      }
      setLocalStream(new MediaStream(baseStream.getTracks()));
    } catch {
      error(`Could not switch ${kind === 'audio' ? 'microphone' : 'camera'}`);
    }
  }

  const applyPttState = useCallback(
    (active: boolean, locked: boolean) => {
      pttActiveRef.current = active;
      setPttActive(active);
      pttLockedRef.current = locked;
      setPttLocked(locked);
      // When active or locked, unmuted (muted = false). When neither, muted (muted = true).
      toggleMic(!active);
    },
    [toggleMic]
  );

  const handlePttDoubleToggle = useCallback(() => {
    setPushToTalkMode(true);
    const nextLocked = !pttLockedRef.current;
    applyPttState(nextLocked, nextLocked);
  }, [applyPttState]);

  const handlePttPressStart = useCallback(
    (isTouch: boolean, e?: React.SyntheticEvent) => {
      setPushToTalkMode(true);
      if (isTouch) {
        if (e && e.cancelable) {
          e.preventDefault();
        }
        pttTouchActiveRef.current = true;
      } else if (pttTouchActiveRef.current) {
        // Suppress simulated ghost mouse events from touch
        return;
      }

      const now = Date.now();
      const delta = now - pttLastTapRef.current;
      pttLastTapRef.current = now;

      // Double-tap or rapid double-click detection (30ms < delta < 420ms)
      if (delta > 30 && delta < 420) {
        handlePttDoubleToggle();
        return;
      }

      // If already locked on, press down should not change lock state
      if (pttLockedRef.current) {
        return;
      }

      // Momentary push to talk
      applyPttState(true, false);
    },
    [handlePttDoubleToggle, applyPttState]
  );

  const handlePttPressEnd = useCallback(
    (isTouch: boolean, e?: React.SyntheticEvent) => {
      if (isTouch) {
        if (e && e.cancelable) {
          e.preventDefault();
        }
        setTimeout(() => {
          pttTouchActiveRef.current = false;
        }, 350);
      } else if (pttTouchActiveRef.current) {
        return;
      }

      // CRITICAL: Synchronous check!
      // If locked, finger lift or mouse release must NEVER turn off mic or lock state!
      if (pttLockedRef.current) {
        return;
      }

      applyPttState(false, false);
    },
    [applyPttState]
  );

  // Full Grupo Push-to-Talk hotkey (`Space` hold or double-tap lock) matching middle.js + live_kit_video_chat.js
  useEffect(() => {
    if (!pushToTalkMode && chatType !== 'group') return;

    const isEditableTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && !pttKeyHeldRef.current && !isEditableTarget(e.target)) {
        e.preventDefault();
        pttKeyHeldRef.current = true;
        handlePttPressStart(false);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && pttKeyHeldRef.current && !isEditableTarget(e.target)) {
        e.preventDefault();
        pttKeyHeldRef.current = false;
        handlePttPressEnd(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      pttKeyHeldRef.current = false;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [pushToTalkMode, chatType, handlePttPressStart, handlePttPressEnd]);

  const remoteList = participants.filter((p) => p.userId !== currentUser.id);
  const pinnedTarget =
    pinnedUserId && pinnedUserId !== currentUser.id
      ? remoteList.find((p) => p.userId === pinnedUserId) || null
      : null;

  const handleAdminRemoteMute = useCallback(
    (targetUserId: string, nextMuted: boolean) => {
      void apiFetch(`/chats/${chatId}/call`, {
        method: 'POST',
        json: {
          action: 'remote_mute',
          callId: callIdRef.current,
          targetUserId,
          muted: nextMuted,
        },
      });
    },
    [chatId]
  );

  return (
    <div
      data-connecting={connecting ? 'true' : 'false'}
      className={cn(
        'bg-[#343434] text-white relative flex flex-col overflow-hidden transition-all',
        chatWindowVisible ? 'h-1/2 min-h-[240px] shrink-0' : 'flex-1 min-h-0'
      )}
    >
      {/* Exact Grupo Pro `.video_chat_settings_box` overlay */}
      {settingsOpen && (
        <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center p-4">
          <div className="relative w-full max-w-md rounded-2xl bg-[#1d1c1c] text-white p-5 shadow-xl space-y-4">
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="absolute right-3 top-3 text-white/75 hover:text-white cursor-pointer"
              aria-label="Close settings"
            >
              <X className="size-4" />
            </button>

            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-[15px] mb-1.5">Microphone</label>
                <select
                  value={selectedMicId}
                  onChange={(e) => void switchDevice('audio', e.target.value)}
                  className="w-full rounded-lg bg-[#151515] border border-black px-3 py-2 text-[15px] text-[#a0a0a0] focus:outline-none"
                >
                  {audioInputs.map((d, idx) => (
                    <option key={d.deviceId || idx} value={d.deviceId}>
                      {d.label || `Microphone ${idx + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              {!audioOnly && (
                <div>
                  <label className="block text-[15px] mb-1.5">Camera</label>
                  <select
                    value={selectedCamId}
                    onChange={(e) => void switchDevice('video', e.target.value)}
                    className="w-full rounded-lg bg-[#151515] border border-black px-3 py-2 text-[15px] text-[#a0a0a0] focus:outline-none"
                  >
                    {videoInputs.map((d, idx) => (
                      <option key={d.deviceId || idx} value={d.deviceId}>
                        {d.label || `Camera ${idx + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Exact Grupo Pro `.video_chat_container` (`background: #000`, flex column) */}
      <div className="relative flex-1 min-h-0 flex flex-col bg-black overflow-hidden">
        {pinnedUserId ? (
          <div className="flex-1 min-h-0 flex flex-col gap-2 p-[10px] pb-[70px]">
            <div className="flex-1 min-h-[60%]">
              {pinnedUserId === currentUser.id ? (
                <ParticipantMediaTile
                  stream={localStream}
                  isLocal
                  displayName="You"
                  avatar={currentUser.avatar}
                  audioOnly={audioOnly && !screenSharing}
                  muted={micMuted}
                  cameraEnabled={!cameraOff}
                  screenSharing={screenSharing}
                  isSpeaking={speakingUsers.has(currentUser.id)}
                  isPinned
                  onTogglePin={() => setPinnedUserId(null)}
                />
              ) : pinnedTarget ? (
                <ParticipantMediaTile
                  stream={remoteStreams[pinnedTarget.userId] || null}
                  isLocal={false}
                  displayName={
                    `${pinnedTarget.user?.firstName || ''} ${pinnedTarget.user?.lastName || ''}`.trim() ||
                    `@${pinnedTarget.user?.username || 'user'}`
                  }
                  avatar={pinnedTarget.user?.avatar}
                  audioOnly={audioOnly && !pinnedTarget.screenSharing}
                  muted={pinnedTarget.muted}
                  cameraEnabled={pinnedTarget.cameraEnabled}
                  screenSharing={pinnedTarget.screenSharing}
                  isSpeaking={speakingUsers.has(pinnedTarget.userId)}
                  isPinned
                  volume={remoteVolumes[pinnedTarget.userId] ?? 100}
                  onVolumeChange={(v) =>
                    setRemoteVolumes((prev) => ({ ...prev, [pinnedTarget.userId]: v }))
                  }
                  onTogglePin={() => setPinnedUserId(null)}
                  canAdminMute={isGroupAdmin}
                  onAdminRemoteMute={(nextMuted) =>
                    handleAdminRemoteMute(pinnedTarget.userId, nextMuted)
                  }
                />
              ) : null}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-[25%]">
              {pinnedUserId !== currentUser.id && (
                <ParticipantMediaTile
                  stream={localStream}
                  isLocal
                  displayName="You"
                  avatar={currentUser.avatar}
                  audioOnly={audioOnly && !screenSharing}
                  muted={micMuted}
                  cameraEnabled={!cameraOff}
                  screenSharing={screenSharing}
                  isSpeaking={speakingUsers.has(currentUser.id)}
                  isPinned={false}
                  onTogglePin={() => setPinnedUserId(currentUser.id)}
                />
              )}
              {remoteList
                .filter((p) => p.userId !== pinnedUserId)
                .map((p) => {
                  const name =
                    `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim() ||
                    `@${p.user?.username || 'user'}`;
                  return (
                    <ParticipantMediaTile
                      key={p.userId}
                      stream={remoteStreams[p.userId] || null}
                      isLocal={false}
                      displayName={name}
                      avatar={p.user?.avatar}
                      audioOnly={audioOnly && !p.screenSharing}
                      muted={p.muted}
                      cameraEnabled={p.cameraEnabled}
                      screenSharing={p.screenSharing}
                      isSpeaking={speakingUsers.has(p.userId)}
                      isPinned={false}
                      volume={remoteVolumes[p.userId] ?? 100}
                      onVolumeChange={(v) =>
                        setRemoteVolumes((prev) => ({ ...prev, [p.userId]: v }))
                      }
                      onTogglePin={() => setPinnedUserId(p.userId)}
                      canAdminMute={isGroupAdmin}
                      onAdminRemoteMute={(nextMuted) => handleAdminRemoteMute(p.userId, nextMuted)}
                    />
                  );
                })}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              'flex-1 min-h-0 overflow-y-auto p-[10px] pb-[75px] grid gap-[8px] auto-rows-[minmax(120px,1fr)]',
              remoteList.length === 0
                ? 'grid-cols-1'
                : remoteList.length === 1
                  ? 'grid-cols-1 sm:grid-cols-2'
                  : 'grid-cols-2 lg:grid-cols-3'
            )}
          >
            {remoteList.map((p) => {
              const name =
                `${p.user?.firstName || ''} ${p.user?.lastName || ''}`.trim() ||
                `@${p.user?.username || 'user'}`;
              return (
                <ParticipantMediaTile
                  key={p.userId}
                  stream={remoteStreams[p.userId] || null}
                  isLocal={false}
                  displayName={name}
                  avatar={p.user?.avatar}
                  audioOnly={audioOnly && !p.screenSharing}
                  muted={p.muted}
                  cameraEnabled={p.cameraEnabled}
                  screenSharing={p.screenSharing}
                  isSpeaking={speakingUsers.has(p.userId)}
                  isPinned={false}
                  volume={remoteVolumes[p.userId] ?? 100}
                  onVolumeChange={(v) =>
                    setRemoteVolumes((prev) => ({ ...prev, [p.userId]: v }))
                  }
                  onTogglePin={() => setPinnedUserId(p.userId)}
                  canAdminMute={isGroupAdmin}
                  onAdminRemoteMute={(nextMuted) => handleAdminRemoteMute(p.userId, nextMuted)}
                />
              );
            })}

            <ParticipantMediaTile
              stream={localStream}
              isLocal
              displayName="You"
              avatar={currentUser.avatar}
              audioOnly={audioOnly && !screenSharing}
              muted={micMuted}
              cameraEnabled={!cameraOff}
              screenSharing={screenSharing}
              isSpeaking={speakingUsers.has(currentUser.id)}
              isPinned={false}
              onTogglePin={() => setPinnedUserId(currentUser.id)}
            />
          </div>
        )}

        {/* Exact Grupo Pro Bottom Controls Dock (`.video_chat_container > .icons`) — ZERO additional icons */}
        <div className="absolute bottom-[25px] left-1/2 -translate-x-1/2 z-20 flex items-center justify-center gap-[8px]">
          <button
            type="button"
            onClick={handleHangup}
            title="Leave Call"
            aria-label="Leave call"
            className="size-[35px] sm:size-[38px] rounded-[8px] bg-[#d40000] hover:bg-[#b80000] text-white inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            <GrupoLeaveCallIcon className="size-[21px]" />
          </button>

          {!audioOnly && (
            <button
              type="button"
              onClick={() => (screenSharing ? void stopScreenShare() : void startScreenShare())}
              title={screenSharing ? 'Stop sharing screen' : 'Share your screen'}
              aria-label={screenSharing ? 'Stop sharing screen' : 'Share your screen'}
              className={cn(
                'size-[35px] sm:size-[38px] rounded-[8px] inline-flex items-center justify-center transition-colors cursor-pointer',
                screenSharing
                  ? 'bg-[#03A9F4] text-white'
                  : 'bg-[#161515] hover:bg-[#161616] text-[#e7e7e7]'
              )}
            >
              <GrupoShareScreenIcon active={screenSharing} className="size-[21px]" />
            </button>
          )}

          {chatType !== 'group' && (
            <button
              type="button"
              onClick={() => {
                pttLockedRef.current = false;
                pttActiveRef.current = false;
                setPttLocked(false);
                setPttActive(false);
                toggleMic();
              }}
              title={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
              className="size-[35px] sm:size-[38px] rounded-[8px] bg-[#161515] hover:bg-[#161616] text-[#e7e7e7] hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <GrupoDockMicIcon muted={micMuted} className="size-[21px]" />
            </button>
          )}

          {!audioOnly && !screenSharing && (
            <button
              type="button"
              onClick={() => void toggleCamera()}
              title={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
              className="size-[35px] sm:size-[38px] rounded-[8px] bg-[#161515] hover:bg-[#161616] text-[#e7e7e7] hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
            >
              <GrupoDockCamIcon off={cameraOff} className="size-[21px]" />
            </button>
          )}

          <button
            type="button"
            onClick={onToggleChatWindow}
            title={chatWindowVisible ? 'Hide chat' : 'Show chat'}
            aria-label="Toggle chat window"
            className={cn(
              'size-[35px] sm:size-[38px] rounded-[8px] inline-flex items-center justify-center transition-colors cursor-pointer',
              chatWindowVisible
                ? 'bg-[#03A9F4] text-white'
                : 'bg-[#161515] hover:bg-[#161616] text-[#e7e7e7] hover:text-white'
            )}
          >
            <GrupoToggleChatIcon className="size-[21px]" />
          </button>

          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            title="Audio & camera settings"
            aria-label="Call settings"
            className="size-[35px] sm:size-[38px] rounded-[8px] bg-[#161515] hover:bg-[#161616] text-[#e7e7e7] hover:text-white inline-flex items-center justify-center transition-colors cursor-pointer"
          >
            <GrupoSettingsIcon className="size-[21px]" />
          </button>

          {chatType === 'group' && (
            <button
              type="button"
              onMouseDown={(e) => handlePttPressStart(false, e)}
              onMouseUp={(e) => handlePttPressEnd(false, e)}
              onMouseLeave={(e) => handlePttPressEnd(false, e)}
              onTouchStart={(e) => handlePttPressStart(true, e)}
              onTouchEnd={(e) => handlePttPressEnd(true, e)}
              onTouchCancel={(e) => handlePttPressEnd(true, e)}
              onDoubleClick={(e) => {
                e.preventDefault();
                handlePttDoubleToggle();
              }}
              onContextMenu={(e) => e.preventDefault()}
              title="Push to Talk (Hold or double-tap to lock, or hold Space)"
              aria-label="Push to Talk"
              className={cn(
                'size-[35px] sm:size-[38px] rounded-[8px] inline-flex items-center justify-center transition-colors cursor-pointer select-none touch-manipulation',
                pttActive || pttLocked
                  ? 'bg-[#03A9F4] text-white'
                  : 'bg-[#161515] hover:bg-[#161616] text-[#e7e7e7] hover:text-white'
              )}
            >
              {pttActive || pttLocked ? (
                <GrupoPttActiveIcon className="size-[21px]" />
              ) : (
                <GrupoPttInactiveIcon className="size-[21px]" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
