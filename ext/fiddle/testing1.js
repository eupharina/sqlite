/*
  2022-05-22

  The author disclaims copyright to this source code.  In place of a
  legal notice, here is a blessing:

  *   May you do good and not evil.
  *   May you find forgiveness for yourself and forgive others.
  *   May you share freely, never taking more than you give.

  ***********************************************************************

  A basic test script for sqlite3-api.js. This file must be run in
  main JS thread and sqlite3.js must have been loaded before it.
*/
(function(){
    const T = self.SqliteTestUtil;
    const log = console.log.bind(console);
    const debug = console.debug.bind(console);

    const assert = function(condition, text) {
        if (!condition) {
            throw new Error('Assertion failed' + (text ? ': ' + text : ''));
        }
    };

    const test1 = function(db,sqlite3){
        const api = sqlite3.api;
        log("Basic sanity tests...");
        T.assert(db._pDb);
        let st = db.prepare(
            new TextEncoder('utf-8').encode("select 3 as a")
            /* Testing handling of Uint8Array input */
        );
        //debug("statement =",st);
        T.assert(st._pStmt)
            .assert(!st._mayGet)
            .assert('a' === st.getColumnName(0))
            .assert(st === db._statements[st._pStmt])
            .assert(1===st.columnCount)
            .assert(0===st.parameterCount)
            .mustThrow(()=>st.bind(1,null))
            .assert(true===st.step())
            .assert(3 === st.get(0))
            .mustThrow(()=>st.get(1))
            .mustThrow(()=>st.get(0,~api.SQLITE_INTEGER))
            .assert(3 === st.get(0,api.SQLITE_INTEGER))
            .assert(3 === st.getInt(0))
            .assert('3' === st.get(0,api.SQLITE_TEXT))
            .assert('3' === st.getString(0))
            .assert(3.0 === st.get(0,api.SQLITE_FLOAT))
            .assert(3.0 === st.getFloat(0))
            .assert(st.get(0,api.SQLITE_BLOB) instanceof Uint8Array)
            .assert(1===st.get(0,api.SQLITE_BLOB).length)
            .assert(st.getBlob(0) instanceof Uint8Array)
            .assert(3 === st.get([])[0])
            .assert(3 === st.get({}).a)
            .assert(3 === st.getJSON(0))
            .assert(st._mayGet)
            .assert(false===st.step())
            .assert(!st._mayGet)
        ;
        let pId = st._pStmt;
        st.finalize();
        T.assert(!st._pStmt)
            .assert(!db._statements[pId]);

        let list = [];
        db.exec({
            sql:['CREATE TABLE t(a,b);',
                 "INSERT INTO t(a,b) VALUES(1,2),(3,4),",
                 "(?,?),('blob',X'6869');"
                ],
            multi: true,
            saveSql: list,
            bind: [5,6]
            /* Achtung: ^^^ bind support might be removed from multi-mode exec. */
        });
        T.assert(2 === list.length);
        //debug("Exec'd SQL:", list);

        let blob = db.selectValue("select b from t where a='blob'");
        T.assert(blob instanceof Uint8Array).
            assert(0x68===blob[0] && 0x69===blob[1]);
        blob = null;

        let counter = 0, colNames = [];
        list.length = 0;
        db.exec(new TextEncoder('utf-8').encode("SELECT a a, b b FROM t"),{
            rowMode: 'object',
            resultRows: list,
            columnNames: colNames,
            callback: function(row,stmt){
                ++counter;
                T.assert((row.a%2 && row.a<6) || 'blob'===row.a);
            }
        });
        T.assert(2 === colNames.length)
            .assert('a' === colNames[0])
            .assert(4 === counter)
            .assert(4 === list.length);
        list.length = 0;
        db.exec("SELECT a a, b b FROM t",{
            rowMode: 'array',
            callback: function(row,stmt){
                ++counter;
                T.assert(Array.isArray(row))
                    .assert((0===row[1]%2 && row[1]<7)
                            || (row[1] instanceof Uint8Array));
            }
        });
        T.assert(8 === counter);
    };

    const testUDF = function(db){
        log("Testing UDF...");
        db.createFunction("foo",function(a,b){return a+b});
        T.assert(7===db.selectValue("select foo(3,4)")).
            assert(5===db.selectValue("select foo(3,?)",2)).
            assert(5===db.selectValue("select foo(?,?2)",[1,4])).
            assert(5===db.selectValue("select foo($a,$b)",{$a:0,$b:5}));
        db.createFunction("bar", {
            arity: -1,
            callback: function(){
                var rc = 0;
                for(let i = 0; i < arguments.length; ++i) rc += arguments[i];
                return rc;
            }
        }).createFunction({
            name: "asis",
            callback: (arg)=>arg
        });

        log("Testing DB::selectValue() w/ UDF...");
        T.assert(0===db.selectValue("select bar()")).
            assert(1===db.selectValue("select bar(1)")).
            assert(3===db.selectValue("select bar(1,2)")).
            assert(-1===db.selectValue("select bar(1,2,-4)")).
            assert('hi'===db.selectValue("select asis('hi')"));
                    
        const eqApprox = function(v1,v2,factor=0.05){
            //debug('eqApprox',v1, v2);
            return v1>=(v2-factor) && v1<=(v2+factor);
        };
        
        T.assert('hi' === db.selectValue("select ?",'hi')).
            assert(null===db.selectValue("select null")).
            assert(null === db.selectValue("select ?",null)).
            assert(null === db.selectValue("select ?",[null])).
            assert(null === db.selectValue("select $a",{$a:null})).
            assert(eqApprox(3.1,db.selectValue("select 3.0 + 0.1"))).
            assert(eqApprox(1.3,db.selectValue("select asis(1 + 0.3)")))
        ;

        log("Testing binding and UDF propagation of blobs...");
        let blobArg = new Uint8Array(2);
        blobArg.set([0x68, 0x69], 0);
        let blobRc = db.selectValue("select asis(?1)", blobArg);
        T.assert(blobRc instanceof Uint8Array).
            assert(2 === blobRc.length).
            assert(0x68==blobRc[0] && 0x69==blobRc[1]);
        blobRc = db.selectValue("select asis(X'6869')");
        T.assert(blobRc instanceof Uint8Array).
            assert(2 === blobRc.length).
            assert(0x68==blobRc[0] && 0x69==blobRc[1]);

        blobArg = new Int8Array(2);
        blobArg.set([0x68, 0x69]);
        //debug("blobArg=",blobArg);
        blobRc = db.selectValue("select asis(?1)", blobArg);
        T.assert(blobRc instanceof Uint8Array).
            assert(2 === blobRc.length);
        //debug("blobRc=",blobRc);
        T.assert(0x68==blobRc[0] && 0x69==blobRc[1]);
    };

    const testAttach = function(db){
        log("Testing ATTACH...");
        db.exec({
            sql:[
                "attach 'foo.db' as foo",
                "create table foo.bar(a)",
                "insert into foo.bar(a) values(1),(2),(3)"
            ].join(';'),
            multi: true
        });
        T.assert(2===db.selectValue('select a from foo.bar where a>1 order by a'));
        db.exec("detach foo");
        T.mustThrow(()=>db.exec("select * from foo.bar"));
    };

    const runTests = function(Module){
        T.assert(Module._free instanceof Function).
            assert(Module.allocate instanceof Function).
            assert(Module.addFunction instanceof Function).
            assert(Module.removeFunction instanceof Function);
        const sqlite3 = Module.sqlite3;
        const api = sqlite3.api;
        const oo = sqlite3.SQLite3;
        log("Loaded module:",api.sqlite3_libversion(),
                    api.sqlite3_sourceid());
        log("Build options:",oo.compileOptionUsed());
        log("api.wasm.HEAP8 size =",api.wasm.HEAP8.length);
        log("wasmEnum",JSON.parse(Module.ccall('sqlite3_wasm_enum_json', 'string', [])));
        [ /* Spot-check a handful of constants to make sure they got installed... */
            'SQLITE_SCHEMA','SQLITE_NULL','SQLITE_UTF8',
            'SQLITE_STATIC', 'SQLITE_DIRECTONLY'
        ].forEach(function(k){
            T.assert('number' === typeof api[k]);
        });
        const db = new oo.DB();
        try {
            log("DB:",db.filename);
            [
                test1, testUDF, testAttach
            ].forEach((f)=>{
                const t = T.counter;
                f(db, sqlite3);
                log("Test count:",T.counter - t);
            });
        }finally{
            db.close();
        }
        log("Total Test count:",T.counter);
    };

    sqlite3InitModule(self.sqlite3TestModule).then(function(theModule){
        /** Use a timeout so that we are (hopefully) out from under
            the module init stack when our setup gets run. Just on
            principle, not because we _need_ to be. */
        //console.debug("theModule =",theModule);
        setTimeout(()=>runTests(theModule), 0);
    });
})();
