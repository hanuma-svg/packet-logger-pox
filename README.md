# 📡 Packet Logger using POX SDN Controller

## 📌 Overview
This project implements a Packet Logger using the POX Software Defined Networking (SDN) controller.  
It captures packets traversing the network, extracts header information, identifies protocol types, and logs the details in real time.

## 🌐 Interactive Demo

**[Live Demo →](https://packetflow-k2yekyzq.manus.space)**

Explore an interactive browser-based visualization of the Packet Logger's POX/OpenFlow packet-processing pipeline.

> The demo is a browser simulation based on the verified `pack.py` implementation. It is not connected to a live POX, Mininet, or Open vSwitch process.

---

## 🎯 Objectives
- Capture packets using SDN controller events
- Extract packet header information
- Identify protocol types (ARP, IPv4, TCP, ICMP)
- Maintain logs of network traffic
- Display packet details in controller terminal

---

## ⚙️ Technologies Used
- Python
- POX SDN Controller
- Mininet (Network Emulator)
- OpenFlow Protocol

---

## 🚀 Features
- 📥 Packet capture using *PacketIn event*
- 🔍 Extracts:
  - MAC Addresses
  - IP Addresses
- 🧠 Protocol Identification:
  - ARP
  - IPv4
  - TCP
  - ICMP
- 📝 Logs packet information in real-time
- 🔁 Enables communication using *packet flooding*

---

## 🏗️ How It Works
1. A packet arrives at the switch
2. If no rule exists, it is sent to the controller (*PacketIn*)
3. POX controller processes the packet
4. Extracts header details (MAC, IP, protocol)
5. Logs the information
6. Forwards packet using flooding
