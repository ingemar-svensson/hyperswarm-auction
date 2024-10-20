const Hyperswarm = require('hyperswarm');
const crypto = require('crypto');

class Auction {
  constructor() {
    this.peerId = crypto.randomBytes(8).toString('hex');
    this.swarm = new Hyperswarm();
    this.items = {}; // Map of itemId to item
    this.peers = []; // List of connected peers
    this.init();
  }

  init() {
    // Generate a topic for discovery
    const topic = crypto.createHash('sha256').update('p2p-auction').digest();

    this.swarm.join(topic, {
      lookup: true, // Find and connect to peers
      announce: true // Announce ourselves to the DHT
    });

    this.swarm.on('connection', (socket, details) => {
      console.log(`New peer connected: ${details.peer.host}:${details.peer.port}`);
      this.peers.push(socket);

      socket.on('data', data => {
        const message = JSON.parse(data.toString());
        this.handleMessage(message, socket);
      });

      socket.on('close', () => {
        console.log('Peer disconnected');
        this.peers = this.peers.filter(s => s !== socket);
      });

      // Request items from the new peer
      socket.write(JSON.stringify({ type: 'request-items', peerId: this.peerId }));
    });
  }

  start() {
    console.log('Auction started. Peer ID:', this.peerId);
  }

  broadcast(message, excludeSocket) {
    const data = JSON.stringify(message);
    this.peers.forEach(socket => {
      if (socket !== excludeSocket) {
        socket.write(data);
      }
    });
  }

  addItem(item) {
    this.items[item.id] = item;
    console.log(`Item added: ${item.name}`);
    this.broadcast({ type: 'new-item', item, peerId: this.peerId });
  }

  bidOnItem(itemId, bidAmount) {
    const item = this.items[itemId];
    if (!item) {
      console.log('Item not found');
      return;
    }
    if (bidAmount <= item.currentBid) {
      console.log('Bid too low');
      return;
    }
    item.currentBid = bidAmount;
    item.highestBidder = this.peerId;
    console.log(`Placed bid on item ${itemId}: ${bidAmount}`);
    this.broadcast({ type: 'new-bid', itemId, bidAmount, peerId: this.peerId });
  }

  handleMessage(message, socket) {
    if (message.peerId === this.peerId) {
      return; // Ignore messages from self
    }

    switch (message.type) {
      case 'new-item':
        if (!this.items[message.item.id]) {
          this.items[message.item.id] = message.item;
          console.log(`New item received: ${message.item.name}`);
        }
        break;

      case 'new-bid':
        const item = this.items[message.itemId];
        if (item && message.bidAmount > item.currentBid) {
          item.currentBid = message.bidAmount;
          item.highestBidder = message.peerId;
          console.log(`New bid on item ${message.itemId}: ${message.bidAmount}`);
        }
        break;

      case 'request-items':
        socket.write(JSON.stringify({ type: 'items-list', items: Object.values(this.items), peerId: this.peerId }));
        break;

      case 'items-list':
        message.items.forEach(item => {
          if (!this.items[item.id]) {
            this.items[item.id] = item;
          }
        });
        console.log(`Received ${message.items.length} items from peer`);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }
}

module.exports = Auction;
