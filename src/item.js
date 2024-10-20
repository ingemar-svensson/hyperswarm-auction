class Item {
  constructor(id, name, description, startingBid) {
    this.id = id;
    this.name = name;
    this.description = description;
    this.startingBid = startingBid;
    this.currentBid = startingBid;
    this.highestBidder = null;
  }
}

module.exports = Item;
