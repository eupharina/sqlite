/*
  2022-09-16

  The author disclaims copyright to this source code.  In place of a
  legal notice, here is a blessing:

  *   May you do good and not evil.
  *   May you find forgiveness for yourself and forgive others.
  *   May you share freely, never taking more than you give.

  ***********************************************************************

  An INCOMPLETE and UNDER CONSTRUCTION experiment for OPFS: a Worker
  which manages asynchronous OPFS handles on behalf of a synchronous
  API which controls it via a combination of Worker messages,
  SharedArrayBuffer, and Atomics.

  Highly indebted to:

  https://github.com/rhashimoto/wa-sqlite/blob/master/src/examples/OriginPrivateFileSystemVFS.js

  for demonstrating how to use the OPFS APIs.

  This file is to be loaded as a Worker. It does not have any direct
  access to the sqlite3 JS/WASM bits, so any bits which it needs (most
  notably SQLITE_xxx integer codes) have to be imported into it via an
  initialization process.
*/
'use strict';
const toss = function(...args){throw new Error(args.join(' '))};
if(self.window === self){
  toss("This code cannot run from the main thread.",
       "Load it as a Worker from a separate Worker.");
}else if(!navigator.storage.getDirectory){
  toss("This API requires navigator.storage.getDirectory.");
}
/**
   Will hold state copied to this object from the syncronous side of
   this API.
*/
const state = Object.create(null);
/**
   verbose:

   0 = no logging output
   1 = only errors
   2 = warnings and errors
   3 = debug, warnings, and errors
*/
state.verbose = 2;

const loggers = {
  0:console.error.bind(console),
  1:console.warn.bind(console),
  2:console.log.bind(console)
};
const logImpl = (level,...args)=>{
  if(state.verbose>level) loggers[level]("OPFS asyncer:",...args);
};
const log =    (...args)=>logImpl(2, ...args);
const warn =   (...args)=>logImpl(1, ...args);
const error =  (...args)=>logImpl(0, ...args);
const metrics = Object.create(null);
metrics.reset = ()=>{
  let k;
  const r = (m)=>(m.count = m.time = m.wait = 0);
  for(k in state.opIds){
    r(metrics[k] = Object.create(null));
  }
  let s = metrics.s11n = Object.create(null);
  s = s.serialize = Object.create(null);
  s.count = s.time = 0;
  s = metrics.s11n.deserialize = Object.create(null);
  s.count = s.time = 0;
};
metrics.dump = ()=>{
  let k, n = 0, t = 0, w = 0;
  for(k in state.opIds){
    const m = metrics[k];
    n += m.count;
    t += m.time;
    w += m.wait;
    m.avgTime = (m.count && m.time) ? (m.time / m.count) : 0;
  }
  console.log(self.location.href,
              "metrics for",self.location.href,":\n",
              JSON.stringify(metrics,0,2)
              /*dev console can't expand this object!*/,
              "\nTotal of",n,"op(s) for",t,"ms",
              "approx",w,"ms spent waiting on OPFS APIs.");
  console.log("Serialization metrics:",JSON.stringify(metrics.s11n,0,2));
};

warn("This file is very much experimental and under construction.",
     self.location.pathname);

/**
   Map of sqlite3_file pointers (integers) to metadata related to a
   given OPFS file handles. The pointers are, in this side of the
   interface, opaque file handle IDs provided by the synchronous
   part of this constellation. Each value is an object with a structure
   demonstrated in the xOpen() impl.
*/
const __openFiles = Object.create(null);

/**
   Expects an OPFS file path. It gets resolved, such that ".."
   components are properly expanded, and returned. If the 2nd
   are is true, it's returned as an array of path elements,
   else it's returned as an absolute path string.
*/
const getResolvedPath = function(filename,splitIt){
  const p = new URL(
    filename, 'file://irrelevant'
  ).pathname;
  return splitIt ? p.split('/').filter((v)=>!!v) : p;
};

/**
   Takes the absolute path to a filesystem element. Returns an array
   of [handleOfContainingDir, filename]. If the 2nd argument is
   truthy then each directory element leading to the file is created
   along the way. Throws if any creation or resolution fails.
*/
const getDirForPath = async function f(absFilename, createDirs = false){
  const path = getResolvedPath(absFilename, true);
  const filename = path.pop();
  let dh = state.rootDir;
  for(const dirName of path){
    if(dirName){
      dh = await dh.getDirectoryHandle(dirName, {create: !!createDirs});
    }
  }
  return [dh, filename];
};


/**
   Stores the given value at state.sabOPView[state.opIds.rc] and then
   Atomics.notify()'s it.
*/
const storeAndNotify = (opName, value)=>{
  log(opName+"() => notify(",state.opIds.rc,",",value,")");
  Atomics.store(state.sabOPView, state.opIds.rc, value);
  Atomics.notify(state.sabOPView, state.opIds.rc);
};

/**
   Throws if fh is a file-holding object which is flagged as read-only.
*/
const affirmNotRO = function(opName,fh){
  if(fh.readOnly) toss(opName+"(): File is read-only: "+fh.filenameAbs);
};


const opTimer = Object.create(null);
opTimer.op = undefined;
opTimer.start = undefined;
const mTimeStart = (op)=>{
  opTimer.start = performance.now();
  opTimer.op = op;
  //metrics[op] || toss("Maintenance required: missing metrics for",op);
  ++metrics[op].count;
};
const mTimeEnd = ()=>(
  metrics[opTimer.op].time += performance.now() - opTimer.start
);
const waitTimer = Object.create(null);
waitTimer.op = undefined;
waitTimer.start = undefined;
const wTimeStart = (op)=>{
  waitTimer.start = performance.now();
  waitTimer.op = op;
  //metrics[op] || toss("Maintenance required: missing metrics for",op);
};
const wTimeEnd = ()=>(
  metrics[waitTimer.op].wait += performance.now() - waitTimer.start
);

/**
   Asynchronous wrappers for sqlite3_vfs and sqlite3_io_methods
   methods. Maintenance reminder: members are in alphabetical order
   to simplify finding them.
*/
const vfsAsyncImpls = {
  mkdir: async function(dirname){
    mTimeStart('mkdir');
    let rc = 0;
    wTimeStart('mkdir');
    try {
        await getDirForPath(dirname+"/filepart", true);
    }catch(e){
      state.s11n.serialize(e.message);
      rc = state.sq3Codes.SQLITE_IOERR;
    }finally{
      wTimeEnd();
    }
    storeAndNotify('mkdir', rc);
    mTimeEnd();
  },
  xAccess: async function(filename){
    mTimeStart('xAccess');
    /* OPFS cannot support the full range of xAccess() queries sqlite3
       calls for. We can essentially just tell if the file is
       accessible, but if it is it's automatically writable (unless
       it's locked, which we cannot(?) know without trying to open
       it). OPFS does not have the notion of read-only.

       The return semantics of this function differ from sqlite3's
       xAccess semantics because we are limited in what we can
       communicate back to our synchronous communication partner: 0 =
       accessible, non-0 means not accessible.
    */
    let rc = 0;
    wTimeStart('xAccess');
    try{
      const [dh, fn] = await getDirForPath(filename);
      await dh.getFileHandle(fn);
    }catch(e){
      state.s11n.serialize(e.message);
      rc = state.sq3Codes.SQLITE_IOERR;
    }finally{
      wTimeEnd();
    }
    storeAndNotify('xAccess', rc);
    mTimeEnd();
  },
  xClose: async function(fid){
    const opName = 'xClose';
    mTimeStart(opName);
    const fh = __openFiles[fid];
    let rc = 0;
    wTimeStart('xClose');
    if(fh){
      delete __openFiles[fid];
      if(fh.accessHandle) await fh.accessHandle.close();
      if(fh.deleteOnClose){
        try{ await fh.dirHandle.removeEntry(fh.filenamePart) }
        catch(e){ warn("Ignoring dirHandle.removeEntry() failure of",fh,e) }
      }
    }else{
      state.s11n.serialize();
      rc = state.sq3Codes.SQLITE_NOTFOUND;
    }
    wTimeEnd();
    storeAndNotify(opName, rc);
    mTimeEnd();
  },
  xDelete: async function(...args){
    mTimeStart('xDelete');
    const rc = await vfsAsyncImpls.xDeleteNoWait(...args);
    storeAndNotify('xDelete', rc);
    mTimeEnd();
  },
  xDeleteNoWait: async function(filename, syncDir = 0, recursive = false){
    /* The syncDir flag is, for purposes of the VFS API's semantics,
       ignored here. However, if it has the value 0x1234 then: after
       deleting the given file, recursively try to delete any empty
       directories left behind in its wake (ignoring any errors and
       stopping at the first failure).

       That said: we don't know for sure that removeEntry() fails if
       the dir is not empty because the API is not documented. It has,
       however, a "recursive" flag which defaults to false, so
       presumably it will fail if the dir is not empty and that flag
       is false.
    */
    let rc = 0;
    wTimeStart('xDelete');
    try {
      while(filename){
        const [hDir, filenamePart] = await getDirForPath(filename, false);
        if(!filenamePart) break;
        await hDir.removeEntry(filenamePart, {recursive});
        if(0x1234 !== syncDir) break;
        filename = getResolvedPath(filename, true);
        filename.pop();
        filename = filename.join('/');
      }
    }catch(e){
      state.s11n.serialize(e.message);
      rc = state.sq3Codes.SQLITE_IOERR_DELETE;
    }
    wTimeEnd();
    return rc;
  },
  xFileSize: async function(fid){
    mTimeStart('xFileSize');
    const fh = __openFiles[fid];
    let sz;
    wTimeStart('xFileSize');
    try{
      sz = await fh.accessHandle.getSize();
      state.s11n.serialize(Number(sz));
      sz = 0;
    }catch(e){
      state.s11n.serialize(e.message);
      sz = state.sq3Codes.SQLITE_IOERR;
    }
    wTimeEnd();
    storeAndNotify('xFileSize', sz);
    mTimeEnd();
  },
  xOpen: async function(fid/*sqlite3_file pointer*/, filename, flags){
    const opName = 'xOpen';
    mTimeStart(opName);
    const deleteOnClose = (state.sq3Codes.SQLITE_OPEN_DELETEONCLOSE & flags);
    const create = (state.sq3Codes.SQLITE_OPEN_CREATE & flags);
    wTimeStart('xOpen');
    try{
      let hDir, filenamePart;
      try {
        [hDir, filenamePart] = await getDirForPath(filename, !!create);
      }catch(e){
        storeAndNotify(opName, state.sql3Codes.SQLITE_NOTFOUND);
        mTimeEnd();
        wTimeEnd();
        return;
      }
      const hFile = await hDir.getFileHandle(filenamePart, {create});
      const fobj = Object.create(null);
      /**
         wa-sqlite, at this point, grabs a SyncAccessHandle and
         assigns it to the accessHandle prop of the file state
         object, but only for certain cases and it's unclear why it
         places that limitation on it.
      */
      fobj.accessHandle = await hFile.createSyncAccessHandle();
      wTimeEnd();
      __openFiles[fid] = fobj;
      fobj.filenameAbs = filename;
      fobj.filenamePart = filenamePart;
      fobj.dirHandle = hDir;
      fobj.fileHandle = hFile;
      fobj.sabView = state.sabFileBufView;
      fobj.readOnly = create ? false : (state.sq3Codes.SQLITE_OPEN_READONLY & flags);
      fobj.deleteOnClose = deleteOnClose;
      storeAndNotify(opName, 0);
    }catch(e){
      wTimeEnd();
      error(opName,e);
      state.s11n.serialize(e.message);
      storeAndNotify(opName, state.sq3Codes.SQLITE_IOERR);
    }
    mTimeEnd();
  },
  xRead: async function(fid,n,offset){
    mTimeStart('xRead');
    let rc = 0;
    try{
      const fh = __openFiles[fid];
      wTimeStart('xRead');
      const nRead = fh.accessHandle.read(
        fh.sabView.subarray(0, n),
        {at: Number(offset)}
      );
      wTimeEnd();
      if(nRead < n){/* Zero-fill remaining bytes */
        fh.sabView.fill(0, nRead, n);
        rc = state.sq3Codes.SQLITE_IOERR_SHORT_READ;
      }
    }catch(e){
      error("xRead() failed",e,fh);
      state.s11n.serialize(e.message);
      rc = state.sq3Codes.SQLITE_IOERR_READ;
    }
    storeAndNotify('xRead',rc);
    mTimeEnd();
  },
  xSync: async function(fid,flags/*ignored*/){
    mTimeStart('xSync');
    const fh = __openFiles[fid];
    let rc = 0;
    if(!fh.readOnly && fh.accessHandle){
      try {
        wTimeStart('xSync');
        await fh.accessHandle.flush();
      }catch(e){
        state.s11n.serialize(e.message);
      }finally{
        wTimeEnd();
      }
    }
    storeAndNotify('xSync',rc);
    mTimeEnd();
  },
  xTruncate: async function(fid,size){
    mTimeStart('xTruncate');
    let rc = 0;
    const fh = __openFiles[fid];
    wTimeStart('xTruncate');
    try{
      affirmNotRO('xTruncate', fh);
      await fh.accessHandle.truncate(size);
    }catch(e){
      error("xTruncate():",e,fh);
      state.s11n.serialize(e.message);
      rc = state.sq3Codes.SQLITE_IOERR_TRUNCATE;
    }
    wTimeEnd();
    storeAndNotify('xTruncate',rc);
    mTimeEnd();
  },
  xWrite: async function(fid,n,offset){
    mTimeStart('xWrite');
    let rc;
    wTimeStart('xWrite');
    try{
      const fh = __openFiles[fid];
      affirmNotRO('xWrite', fh);
      rc = (
        n === fh.accessHandle.write(fh.sabView.subarray(0, n),
                                    {at: Number(offset)})
      ) ? 0 : state.sq3Codes.SQLITE_IOERR_WRITE;
    }catch(e){
      error("xWrite():",e,fh);
      state.s11n.serialize(e.message);
      rc = state.sq3Codes.SQLITE_IOERR_WRITE;
    }finally{
      wTimeEnd();
    }
    storeAndNotify('xWrite',rc);
    mTimeEnd();
  }
};

const initS11n = ()=>{
  /**
     ACHTUNG: this code is 100% duplicated in the other half of this
     proxy! The documentation is maintained in the "synchronous half".
  */
  if(state.s11n) return state.s11n;
  const textDecoder = new TextDecoder(),
  textEncoder = new TextEncoder('utf-8'),
  viewU8 = new Uint8Array(state.sabIO, state.sabS11nOffset, state.sabS11nSize),
  viewDV = new DataView(state.sabIO, state.sabS11nOffset, state.sabS11nSize);
  state.s11n = Object.create(null);
  const TypeIds = Object.create(null);
  TypeIds.number  = { id: 1, size: 8, getter: 'getFloat64', setter: 'setFloat64' };
  TypeIds.bigint  = { id: 2, size: 8, getter: 'getBigInt64', setter: 'setBigInt64' };
  TypeIds.boolean = { id: 3, size: 4, getter: 'getInt32', setter: 'setInt32' };
  TypeIds.string =  { id: 4 };
  const getTypeId = (v)=>(
    TypeIds[typeof v]
      || toss("Maintenance required: this value type cannot be serialized.",v)
  );
  const getTypeIdById = (tid)=>{
    switch(tid){
      case TypeIds.number.id: return TypeIds.number;
      case TypeIds.bigint.id: return TypeIds.bigint;
      case TypeIds.boolean.id: return TypeIds.boolean;
      case TypeIds.string.id: return TypeIds.string;
      default: toss("Invalid type ID:",tid);
    }
  };
  state.s11n.deserialize = function(){
    ++metrics.s11n.deserialize.count;
    const t = performance.now();
    const argc = viewU8[0];
    const rc = argc ? [] : null;
    if(argc){
      const typeIds = [];
      let offset = 1, i, n, v;
      for(i = 0; i < argc; ++i, ++offset){
        typeIds.push(getTypeIdById(viewU8[offset]));
      }
      for(i = 0; i < argc; ++i){
        const t = typeIds[i];
        if(t.getter){
          v = viewDV[t.getter](offset, state.littleEndian);
          offset += t.size;
        }else{/*String*/
          n = viewDV.getInt32(offset, state.littleEndian);
          offset += 4;
          v = textDecoder.decode(viewU8.slice(offset, offset+n));
          offset += n;
        }
        rc.push(v);
      }
    }
    //log("deserialize:",argc, rc);
    metrics.s11n.deserialize.time += performance.now() - t;
    return rc;
  };
  state.s11n.serialize = function(...args){
    const t = performance.now();
    ++metrics.s11n.serialize.count;
    if(args.length){
      //log("serialize():",args);
      const typeIds = [];
      let i = 0, offset = 1;
      viewU8[0] = args.length & 0xff /* header = # of args */;
      for(; i < args.length; ++i, ++offset){
        /* Write the TypeIds.id value into the next args.length
           bytes. */
        typeIds.push(getTypeId(args[i]));
        viewU8[offset] = typeIds[i].id;
      }
      for(i = 0; i < args.length; ++i) {
        /* Deserialize the following bytes based on their
           corresponding TypeIds.id from the header. */
        const t = typeIds[i];
        if(t.setter){
          viewDV[t.setter](offset, args[i], state.littleEndian);
          offset += t.size;
        }else{/*String*/
          const s = textEncoder.encode(args[i]);
          viewDV.setInt32(offset, s.byteLength, state.littleEndian);
          offset += 4;
          viewU8.set(s, offset);
          offset += s.byteLength;
        }
      }
      //log("serialize() result:",viewU8.slice(0,offset));
    }else{
      viewU8[0] = 0;
    }
    metrics.s11n.serialize.time += performance.now() - t;
  };
  return state.s11n;
}/*initS11n()*/;

const waitLoop = async function f(){
  const opHandlers = Object.create(null);
  for(let k of Object.keys(state.opIds)){
    const vi = vfsAsyncImpls[k];
    if(!vi) continue;
    const o = Object.create(null);
    opHandlers[state.opIds[k]] = o;
    o.key = k;
    o.f = vi;// || toss("No vfsAsyncImpls[",k,"]");
  }
  let metricsTimer = self.location.port>=1024 ? performance.now() : 0;
  // ^^^ in dev environment, dump out these metrics one time after a delay.
  while(true){
    try {
      if('timed-out'===Atomics.wait(state.sabOPView, state.opIds.whichOp, 0, 500)){
        continue;
      }
      const opId = Atomics.load(state.sabOPView, state.opIds.whichOp);
      Atomics.store(state.sabOPView, state.opIds.whichOp, 0);
      const hnd = opHandlers[opId] ?? toss("No waitLoop handler for whichOp #",opId);
      const args = state.s11n.deserialize();
      state.s11n.serialize()/* clear s11n to keep the caller from
                               confusing this with an exception string
                               written by the upcoming operation */;
      //warn("waitLoop() whichOp =",opId, hnd, args);
      if(hnd.f) await hnd.f(...args);
      else error("Missing callback for opId",opId);
    }catch(e){
      error('in waitLoop():',e.message);
    }finally{
      // We can't call metrics.dump() from the dev console because this
      // thread is continually tied up in Atomics.wait(), so let's
      // do, for dev purposes only, a dump one time after 60 seconds.
      if(metricsTimer && (performance.now() > metricsTimer + 60000)){
        metrics.dump();
        metricsTimer = 0;
      }
    }
  };
};

navigator.storage.getDirectory().then(function(d){
  const wMsg = (type)=>postMessage({type});
  state.rootDir = d;
  self.onmessage = function({data}){
    switch(data.type){
        case 'opfs-async-init':{
          /* Receive shared state from synchronous partner */
          const opt = data.args;
          state.littleEndian = opt.littleEndian;
          state.verbose = opt.verbose ?? 2;
          state.fileBufferSize = opt.fileBufferSize;
          state.sabS11nOffset = opt.sabS11nOffset;
          state.sabS11nSize = opt.sabS11nSize;
          state.sabOP = opt.sabOP;
          state.sabOPView = new Int32Array(state.sabOP);
          state.sabIO = opt.sabIO;
          state.sabFileBufView = new Uint8Array(state.sabIO, 0, state.fileBufferSize);
          state.sabS11nView = new Uint8Array(state.sabIO, state.sabS11nOffset, state.sabS11nSize);
          state.opIds = opt.opIds;
          state.sq3Codes = opt.sq3Codes;
          Object.keys(vfsAsyncImpls).forEach((k)=>{
            if(!Number.isFinite(state.opIds[k])){
              toss("Maintenance required: missing state.opIds[",k,"]");
            }
          });
          initS11n();
          metrics.reset();
          log("init state",state);
          wMsg('opfs-async-inited');
          waitLoop();
          break;
        }
    }
  };
  wMsg('opfs-async-loaded');
}).catch((e)=>error(e));
