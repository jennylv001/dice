declare interface RTCIceCandidateInit {
  candidate?: string | null;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
  foundation?: string | null;
  component?: RTCIceComponent;
  priority?: number;
  protocol?: RTCIceProtocol;
  relatedAddress?: string | null;
  relatedPort?: number | null;
  tcpType?: RTCIceTcpCandidateType;
  type?: RTCIceCandidateType;
  address?: string | null;
  port?: number | null;
}

declare type RTCIceComponent = "rtp" | "rtcp";
declare type RTCIceProtocol = "udp" | "tcp";
declare type RTCIceTcpCandidateType = "active" | "passive" | "so";
declare type RTCIceCandidateType = "host" | "srflx" | "prflx" | "relay";
