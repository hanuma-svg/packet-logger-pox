from pox.core import core
import pox.openflow.libopenflow_01 as of
from pox.lib.packet import ethernet, ipv4, icmp, tcp, udp

log = core.getLogger()

class PacketLogger(object):
    def __init__(self):
        core.openflow.addListeners(self)
        self.mac_to_port = {}   # Learning switch table
        log.info("Packet Logger Started")

    def _handle_PacketIn(self, event):
        packet = event.parsed

        if not packet:
            return

        log.info("---- Packet ----")

        # Ethernet
        log.info("Ethernet: %s -> %s", packet.src, packet.dst)

        # IP + Protocol
        ip = packet.find('ipv4')
        if ip:
            log.info("IP: %s -> %s", ip.srcip, ip.dstip)

            if packet.find('icmp'):
                log.info("Protocol: ICMP")
            elif packet.find('tcp'):
                log.info("Protocol: TCP")
            elif packet.find('udp'):
                log.info("Protocol: UDP")
            else:
                log.info("Protocol: OTHER")

        # 🔥 LEARNING SWITCH LOGIC

        # Learn source MAC → port
        self.mac_to_port[packet.src] = event.port

        # Decide output port
        if packet.dst in self.mac_to_port:
            out_port = self.mac_to_port[packet.dst]
        else:
            out_port = of.OFPP_FLOOD

        # Send packet
        msg = of.ofp_packet_out()
        msg.data = event.ofp
        msg.actions.append(of.ofp_action_output(port=out_port))
        event.connection.send(msg)


def launch():
    core.registerNew(PacketLogger)
