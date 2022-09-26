/*
  2022-07-22

  The author disclaims copyright to this source code.  In place of a
  legal notice, here is a blessing:

  *   May you do good and not evil.
  *   May you find forgiveness for yourself and forgive others.
  *   May you share freely, never taking more than you give.

  ***********************************************************************

  This file glues together disparate pieces of JS which are loaded in
  previous steps of the sqlite3-api.js bootstrapping process:
  sqlite3-api-prologue.js, whwasmutil.js, and jaccwabyt.js. It
  initializes the main API pieces so that the downstream components
  (e.g. sqlite3-api-oo1.js) have all that they need.
*/
self.sqlite3ApiBootstrap.initializers.push(function(sqlite3){
  'use strict';
  const toss = (...args)=>{throw new Error(args.join(' '))};
  const capi = sqlite3.capi, wasm = capi.wasm, util = capi.util;
  self.WhWasmUtilInstaller(capi.wasm);
  delete self.WhWasmUtilInstaller;

  if(0){
    /*  "The problem" is that the following isn't type-safe.
        OTOH, nothing about WASM pointers is. */
    /**
       Add the `.pointer` xWrap() signature entry to extend
       the `pointer` arg handler to check for a `pointer`
       property. This can be used to permit, e.g., passing
       an SQLite3.DB instance to a C-style sqlite3_xxx function
       which takes an `sqlite3*` argument.
    */
    const oldP = wasm.xWrap.argAdapter('pointer');
    const adapter = function(v){
      if(v && 'object'===typeof v && v.constructor){
        const x = v.pointer;
        if(Number.isInteger(x)) return x;
        else toss("Invalid (object) type for pointer-type argument.");
      }
      return oldP(v);
    };
    wasm.xWrap.argAdapter('.pointer', adapter);
  } /* ".pointer" xWrap() argument adapter */

  // WhWasmUtil.xWrap() bindings...
  {
    /**
       Add some descriptive xWrap() aliases for '*' intended to
       (A) initially improve readability/correctness of capi.signatures
       and (B) eventually perhaps provide some sort of type-safety
       in their conversions.
    */
    const aPtr = wasm.xWrap.argAdapter('*');
    wasm.xWrap.argAdapter('sqlite3*', aPtr)('sqlite3_stmt*', aPtr);
    wasm.xWrap.resultAdapter('sqlite3*', aPtr)('sqlite3_stmt*', aPtr);

    /**
       Populate api object with sqlite3_...() by binding the "raw" wasm
       exports into type-converting proxies using wasm.xWrap().
    */
    for(const e of wasm.bindingSignatures){
      capi[e[0]] = wasm.xWrap.apply(null, e);
    }
    for(const e of wasm.bindingSignatures.wasm){
      capi.wasm[e[0]] = wasm.xWrap.apply(null, e);
    }

    /* For C API functions which cannot work properly unless
       wasm.bigIntEnabled is true, install a bogus impl which
       throws if called when bigIntEnabled is false. */
    const fI64Disabled = function(fname){
      return ()=>toss(fname+"() disabled due to lack",
                      "of BigInt support in this build.");
    };
    for(const e of wasm.bindingSignatures.int64){
      capi[e[0]] = wasm.bigIntEnabled
        ? wasm.xWrap.apply(null, e)
        : fI64Disabled(e[0]);
    }

    if(wasm.exports.sqlite3_wasm_db_error){
      util.sqlite3_wasm_db_error = capi.wasm.xWrap(
        'sqlite3_wasm_db_error', 'int', 'sqlite3*', 'int', 'string'
      );
    }else{
      util.sqlite3_wasm_db_error = function(pDb,errCode,msg){
        console.warn("sqlite3_wasm_db_error() is not exported.",arguments);
        return errCode;
      };
    }

    /**
       When registering a VFS and its related components it may be
       necessary to ensure that JS keeps a reference to them to keep
       them from getting garbage collected. Simply pass each such value
       to this function and a reference will be held to it for the life
       of the app.
    */
    capi.sqlite3_vfs_register.addReference = function f(...args){
      if(!f._) f._ = [];
      f._.push(...args);
    };

  }/*xWrap() bindings*/;

  /**
     Scope-local holder of the two impls of sqlite3_prepare_v2/v3().
  */
  const __prepare = Object.create(null);
  /**
     This binding expects a JS string as its 2nd argument and
     null as its final argument. In order to compile multiple
     statements from a single string, the "full" impl (see
     below) must be used.
  */
  __prepare.basic = wasm.xWrap('sqlite3_prepare_v3',
                               "int", ["sqlite3*", "string",
                                       "int"/*ignored for this impl!*/,
                                       "int", "**",
                                       "**"/*MUST be 0 or null or undefined!*/]);
  /**
     Impl which requires that the 2nd argument be a pointer
     to the SQL string, instead of being converted to a
     string. This variant is necessary for cases where we
     require a non-NULL value for the final argument
     (exec()'ing multiple statements from one input
     string). For simpler cases, where only the first
     statement in the SQL string is required, the wrapper
     named sqlite3_prepare_v2() is sufficient and easier to
     use because it doesn't require dealing with pointers.
  */
  __prepare.full = wasm.xWrap('sqlite3_prepare_v3',
                              "int", ["sqlite3*", "*", "int", "int",
                                      "**", "**"]);

  /* Documented in the api object's initializer. */
  capi.sqlite3_prepare_v3 = function f(pDb, sql, sqlLen, prepFlags, ppStmt, pzTail){
    if(util.isSQLableTypedArray(sql)) sql = util.typedArrayToString(sql);
    switch(typeof sql){
        case 'string': return __prepare.basic(pDb, sql, -1, prepFlags, ppStmt, null);
        case 'number': return __prepare.full(pDb, sql, sqlLen, prepFlags, ppStmt, pzTail);
        default:
          return util.sqlite3_wasm_db_error(
            pDb, capi.SQLITE_MISUSE,
            "Invalid SQL argument type for sqlite3_prepare_v2/v3()."
          );
    }
  };

  capi.sqlite3_prepare_v2 =
    (pDb, sql, sqlLen, ppStmt, pzTail)=>capi.sqlite3_prepare_v3(pDb, sql, sqlLen, 0, ppStmt, pzTail);

  /**
     Install JS<->C struct bindings for the non-opaque struct types we
     need... */
  sqlite3.StructBinder = self.Jaccwabyt({
    heap: 0 ? wasm.memory : wasm.heap8u,
    alloc: wasm.alloc,
    dealloc: wasm.dealloc,
    functionTable: wasm.functionTable,
    bigIntEnabled: wasm.bigIntEnabled,
    memberPrefix: '$'
  });
  delete self.Jaccwabyt;

  {/* Import C-level constants and structs... */
    const cJson = wasm.xCall('sqlite3_wasm_enum_json');
    if(!cJson){
      toss("Maintenance required: increase sqlite3_wasm_enum_json()'s",
           "static buffer size!");
    }
    wasm.ctype = JSON.parse(wasm.cstringToJs(cJson));
    //console.debug('wasm.ctype length =',wasm.cstrlen(cJson));
    for(const t of ['access', 'blobFinalizers', 'dataTypes',
                    'encodings', 'fcntl', 'flock', 'ioCap',
                    'openFlags', 'prepareFlags', 'resultCodes',
                    'syncFlags', 'udfFlags', 'version'
                   ]){
      for(const e of Object.entries(wasm.ctype[t])){
        // ^^^ [k,v] there triggers a buggy code transormation via one
        // of the Emscripten-driven optimizers.
        capi[e[0]] = e[1];
      }
    }
    const __rcMap = Object.create(null);
    for(const t of ['resultCodes']){
      for(const e of Object.entries(wasm.ctype[t])){
        __rcMap[e[1]] = e[0];
      }
    }
    /**
       For the given integer, returns the SQLITE_xxx result code as a
       string, or undefined if no such mapping is found.
    */
    capi.sqlite3_wasm_rc_str = (rc)=>__rcMap[rc];
    /* Bind all registered C-side structs... */
    for(const s of wasm.ctype.structs){
      capi[s.name] = sqlite3.StructBinder(s);
    }
  }/*end C constant imports*/
});
