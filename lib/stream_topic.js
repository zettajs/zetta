var minimatch = require('minimatch');

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

  if (topicComponents.length < 3 && topicComponents.indexOf('**') === -1) {
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
  if(topicComponents[3]) {
    var streamComponents = topicComponents[3].split('?');
    this.streamName = checkForRegex(streamComponents[0]);
    this.streamQuery = streamComponents[1];
  } else {
    this.streamName = undefined;  
  }
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

StreamTopic.prototype.match = function(topicString) {
  if (this._useComponents) {
    var components = [ this.serverName, this.deviceType, this.deviceId, this.streamName ].filter(function(i) { return i !== undefined });;
    var checkedComponents = [];
    var topicStringComponents = [];
    var checkTopic = StreamTopic.parse(topicString);
    var checkComponents = [ checkTopic.serverName, checkTopic.deviceType, checkTopic.deviceId, checkTopic.streamName ].filter(function(i) { return i !== undefined });
    var matchStart = null;

    //{^Det.+$}/led/**
    //[RegExp, String]
    //['Detroit-123', 'led/123/state']
    //RegExp -> 'Detroit-123' && String -> 'led/123/state'
    

    //{^Det.+$}/led/*/{^sta.+$}
    //[RegExp, String, RegExp]
    //['Detroit-123', 'led/123', 'state']
    //RegExp -> 'Detroit-123' && String -> 'led/123/state' && RegExp -> 'state'

    //{^Det.+$}/**/{^stream.+$}
    //[RegExp, String, RegExp]
    //['Detroit-123', 'led/123', 'stream-123']
  
    components.forEach(function(component, idx) {
      if (component instanceof RegExp) {
        if(matchStart !== null) {
          var checkedComponent = components.slice(matchStart, idx).join('/');
          checkedComponents.push(checkedComponent);
          if(checkedComponent === '**' && components.length < 4) {
            topicStringComponents.push(checkComponents.slice(matchStart, idx + 1).join('/'));   
            topicStringComponents.push(checkComponents[idx + 1]);
            return;
          } else {
            topicStringComponents.push(checkComponents.slice(matchStart, idx).join('/'));
          }
          matchStart = null;
        }
        checkedComponents.push(component);
        topicStringComponents.push(checkComponents[idx]);
      } else if(component !== undefined) {
        if(matchStart === null) {
          matchStart = idx;
        }
        if(idx === components.length - 1) {
          checkedComponents.push(components.slice(matchStart).join('/'));   
          topicStringComponents.push(checkComponents.slice(matchStart).join('/'));
        }
      }
    });

    return checkedComponents.every(function(component, idx) {
      var topicComponent = topicStringComponents[idx];    
      if(component instanceof RegExp) {
        return component.exec(topicComponent);  
      } else {
        return minimatch(topicComponent, component);  
      }
    }); 
  } else {
    return minimatch(topicString, this._original);
  }
};

StreamTopic.parse = function(topicString) {
  var topic =  new StreamTopic();  
  topic.parse(topicString);
  return topic;
}
