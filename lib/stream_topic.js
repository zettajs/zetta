var StreamTopic = module.exports = function() {
  this.serverName = null;
  this.deviceType = null;
  this.deviceId = null;
  this.streamName = null;
  this.streamQuery =  null;
  this._original = null;
  this._useComponents = false;
}

StreamTopic.prototype.parse = function(topicString){
  this._original = topicString;

  var previousCharacter = null;
  var currentCharacter = null;
  var start = 0;
  var topicComponents = [];
  for(var i = 0; i < topicString.length; i++) {
    currentCharacter = topicString[i];
    if(currentCharacter === '/' && previousCharacter !== '\\') {
      topicComponents.push(topicString.slice(start, i));
      start = i + 1;
    } else if(i === topicString.length - 1) {
      topicComponents.push(topicString.slice(start, topicString.length));
    }
    previousCharacter = currentCharacter;
  }

  if (topicComponents.length < 3) {
    return;
  }

  if (topicComponents.length === 3) {
    topicComponents.unshift(null);
  }

  function checkForRegex(s) {
    if (typeof s === 'string') {
      if(s[0] === '{' && s[s.length - 1] === '}') {
        return new RegExp(s.slice(1, -1));
      } else {
        return s;  
      }
    }
  }

  // led/123/state
  // _peer/connect
  // _peer/disconnect
  // query:asdasd
  // query/asd
  this._useComponents = true;
  this.serverName = checkForRegex(topicComponents[0]);
  this.deviceType = checkForRegex(topicComponents[1]);
  this.deviceId = checkForRegex(topicComponents[2]);
  var streamComponents = topicComponents[3].split('?');
  this.streamName = checkForRegex(streamComponents[0]);
  this.streamQuery = streamComponents[1];
}

StreamTopic.prototype.hash = function() {
  return this._original;
};

StreamTopic.prototype.pubsubIdentifier = function() {

  function sanitizeRegex(part) {
    if (part instanceof RegExp) {
      return '{' + part.source + '}';
    } else {
      return part;
    }
  }
  
  if (this._useComponents) {
    return sanitizeRegex(this.deviceType) + '/' + sanitizeRegex(this.deviceId) + '/' + sanitizeRegex(this.streamName);
  } else {
    return this._original;
  }
};

StreamTopic.prototype.match = function(topic) {
  if (!this._useComponents) {
    return topic === this._original;
  } else {
    return topic === this._original;
  }
};

StreamTopic.parse = function(topicString) {
  var topic =  new StreamTopic();  
  topic.parse(topicString);
  return topic;
}
