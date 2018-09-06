

// CSS classes:
// MusicPlayer_Controls
// MusicPlayer_Play
// MusicPlayer_Stop
// MusicPlayer_ListItem
// MusicPlayer_Title
// MusicPlayer_Description
// MusicPlayer_Download
// MusicPlayer_List
function MusicPlayer() {

  this.init = ( dom_element_for_playlist, tracks ) => {
    this.tracks = tracks;
    dom_element_for_playlist.appendChild( this.genPlaylist( tracks ) )
  }

  this.genPlay = ( track ) => {
    //`<i onclick='play( ${JSON.stringify( track )}, this.parentNode )' class="material-icons noselect">play_arrow</i>`; }
    let i = document.createElement('i')
    let ths = this;
    i.onclick = function (e) { ths.play( track, this.parentNode ) }
    i.className = "material-icons noselect MusicPlayer_Controls MusicPlayer_Play"
    i.innerHTML = "play_arrow"
    return i
  }

  this.genStop = ( track ) => {
    //`<i onclick='stop( ${JSON.stringify( track )}, this.parentNode )' class="material-icons noselect">stop</i>`;
    let i = document.createElement('i')
    let ths = this;
    i.onclick = function (e) { ths.stop( track, this.parentNode ) }
    i.className = "material-icons noselect MusicPlayer_Controls MusicPlayer_Stop"
    i.innerHTML = "stop"
    return i
  }

  this.instop = false;
  this.stop = ( track, parent_node ) => {
    return new Promise( (rs,rj) => {
      if (this.now_playing) {
        if (this.instop) return rj();
        this.instop = true;

        // update the graphic
        parent_node.innerHTML = "";
        parent_node.appendChild( this.genPlay( track ) );
        this.now_playing.prevNode.innerHTML = ""
        this.now_playing.prevNode.appendChild( this.genPlay( this.now_playing ) );

        let doit = () => {
          console.log( "stopping ", this.now_playing.title, this.now_playing.file );
          if (this.use_stop_audio)
            this.now_playing.audio.pause();
          delete this.now_playing.audio; // hard-kill the audio, no need to pause, we'll rebuffer it later
          this.now_playing.playPromise = undefined;
          this.now_playing = undefined;
          this.instop = false;
          rs();
        }

        // guard if the audio is still loading
        if (this.now_playing.playPromise !== undefined)
          this.now_playing.playPromise.then( r => {
            doit();
          });
        else
          doit();
      } else {
        rs();
      }
    });
  }

  this.play = ( track, parent_node ) => {
    this.stop( track, parent_node ).then(
      r => {
        if (this.now_playing === undefined) {
          console.log( "playing ", track.title, track.file );

          // update the graphic
          parent_node.innerHTML = ""
          parent_node.appendChild( this.genStop( track ) );

          this.now_playing = track;
          this.now_playing.audio = new Audio( track.file );
          this.now_playing.playPromise = this.now_playing.audio.play();
          if (!this.use_stop_audio)
            this.now_playing.playPromise = undefined; // disable
          this.now_playing.prevNode = parent_node;
        }
      },
      err => console.log( "pressing too fast, last track hasn't finished loading... waiting..." )
    )
  }

  // create the playlist like so:
  //   <div id="playlist"></div>
  //   <script>playlist.innerHTML = genPlaylist( tracks );</script>
  this.genPlaylist = ( tr ) => {
    //return `<ul style='margin: 0; padding: 0;'>` +
    //  tr.map( t => `<li><span>${genPlay( t )}</span><a href='${t.file}' download>${t.title}</a> ${t.desc}` ).join("\n") +
    //  `</ul>`;

    let root = document.createElement('ul')
    root.style = `margin: 0; padding: 0; ${noselect_style}`
    root.className = "MusicPlayer_List";
    tr.forEach( t => {
      let li = document.createElement('li')
      li.className = "MusicPlayer_ListItem"

      let controls = document.createElement('span')
      //controls.className = "MusicPlayer_Controls"
      controls.appendChild( this.genPlay( t ) );

      //let title = document.createElement('a')
      //title.href = t.file
      //title.download = '';
      //title.innerHTML = t.title
      let title = document.createElement('span')
      title.className = "MusicPlayer_Title"
      title.innerHTML = t.title

      let desc = document.createElement('span')
      desc.className = "MusicPlayer_Description"
      desc.innerHTML = t.desc

      let cloud_download = document.createElement('i');
      cloud_download.className = "material-icons MusicPlayer_Download";
      cloud_download.innerHTML = "cloud_download";
      let download = document.createElement('a')
      download.href = t.file
      download.download = '';
      download.appendChild( cloud_download );

      li.appendChild( controls )
      li.appendChild( title )
      li.appendChild( desc )
      li.appendChild( download )
      root.appendChild( li )
    })
    return root
  }



  let noselect_style = `
    -webkit-touch-callout: none; /* iOS Safari */
      -webkit-user-select: none; /* Safari */
      -khtml-user-select: none; /* Konqueror HTML */
        -moz-user-select: none; /* Firefox */
          -ms-user-select: none; /* Internet Explorer/Edge */
              user-select: none; /* Non-prefixed version, currently
                                    supported by Chrome and Opera */
  `;

  this.now_playing = undefined;
  this.use_stop_audio = false;
  this.tracks;
}

