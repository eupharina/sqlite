#include "sqlite3.c"

/*
** This function is NOT part of the sqlite3 public API. It is strictly
** for use by the sqlite project's own JS/WASM bindings.
**
** For purposes of certain hand-crafted C/Wasm function bindings, we
** need a way of reporting errors which is consistent with the rest of
** the C API, as opposed to throwing JS exceptions. To that end, this
** internal-use-only function is a thin proxy around
** sqlite3ErrorWithMessage(). The intent is that it only be used from
** Wasm bindings such as sqlite3_prepare_v2/v3(), and definitely not
** from client code.
**
** Returns err_code.
*/
int sqlite3_wasm_db_error(sqlite3*db, int err_code,
                          const char *zMsg){
  if(0!=zMsg){
    const int nMsg = sqlite3Strlen30(zMsg);
    sqlite3ErrorWithMsg(db, err_code, "%.*s", nMsg, zMsg);
  }else{
    sqlite3ErrorWithMsg(db, err_code, NULL);
  }
  return err_code;
}

/*
** This function is NOT part of the sqlite3 public API. It is strictly
** for use by the sqlite project's own JS/WASM bindings. Unlike the
** rest of the sqlite3 API, this part requires C99 for snprintf() and
** variadic macros.
**
** Returns a string containing a JSON-format "enum" of C-level
** constants intended to be imported into the JS environment. The JSON
** is initialized the first time this function is called and that
** result is reused for all future calls.
**
** If this function returns NULL then it means that the internal
** buffer is not large enough for the generated JSON. In debug builds
** that will trigger an assert().
*/
const char * sqlite3_wasm_enum_json(void){
  static char strBuf[1024 * 8] = {0} /* where the JSON goes */;
  int n = 0, childCount = 0, structCount = 0
    /* output counters for figuring out where commas go */;
  char * pos = &strBuf[1] /* skip first byte for now to help protect
                          ** against a small race condition */;
  char const * const zEnd = pos + sizeof(strBuf) /* one-past-the-end */;
  if(strBuf[0]) return strBuf;
  /* Leave strBuf[0] at 0 until the end to help guard against a tiny
  ** race condition. If this is called twice concurrently, they might
  ** end up both writing to strBuf, but they'll both write the same
  ** thing, so that's okay. If we set byte 0 up front then the 2nd
  ** instance might return and use the string before the 1st instance
  ** is done filling it. */

/* Core output macros... */
#define lenCheck assert(pos < zEnd - 128 \
  && "sqlite3_wasm_enum_json() buffer is too small."); \
  if(pos >= zEnd - 128) return 0
#define outf(format,...) \
  pos += snprintf(pos, ((size_t)(zEnd - pos)), format, __VA_ARGS__); \
  lenCheck
#define out(TXT) outf("%s",TXT)
#define CloseBrace(LEVEL) \
  assert(LEVEL<5); memset(pos, '}', LEVEL); pos+=LEVEL; lenCheck

/* Macros for emitting maps of integer- and string-type macros to
** their values. */
#define DefGroup(KEY) n = 0; \
  outf("%s\"" #KEY "\": {",(childCount++ ? "," : ""));
#define DefInt(KEY)                                     \
  outf("%s\"%s\": %d", (n++ ? ", " : ""), #KEY, (int)KEY)
#define DefStr(KEY)                                     \
  outf("%s\"%s\": \"%s\"", (n++ ? ", " : ""), #KEY, KEY)
#define _DefGroup CloseBrace(1)

  DefGroup(version) {
    DefInt(SQLITE_VERSION_NUMBER);
    DefStr(SQLITE_VERSION);
    DefStr(SQLITE_SOURCE_ID);
  } _DefGroup;

  DefGroup(resultCodes) {
    DefInt(SQLITE_OK);
    DefInt(SQLITE_ERROR);
    DefInt(SQLITE_INTERNAL);
    DefInt(SQLITE_PERM);
    DefInt(SQLITE_ABORT);
    DefInt(SQLITE_BUSY);
    DefInt(SQLITE_LOCKED);
    DefInt(SQLITE_NOMEM);
    DefInt(SQLITE_READONLY);
    DefInt(SQLITE_INTERRUPT);
    DefInt(SQLITE_IOERR);
    DefInt(SQLITE_CORRUPT);
    DefInt(SQLITE_NOTFOUND);
    DefInt(SQLITE_FULL);
    DefInt(SQLITE_CANTOPEN);
    DefInt(SQLITE_PROTOCOL);
    DefInt(SQLITE_EMPTY);
    DefInt(SQLITE_SCHEMA);
    DefInt(SQLITE_TOOBIG);
    DefInt(SQLITE_CONSTRAINT);
    DefInt(SQLITE_MISMATCH);
    DefInt(SQLITE_MISUSE);
    DefInt(SQLITE_NOLFS);
    DefInt(SQLITE_AUTH);
    DefInt(SQLITE_FORMAT);
    DefInt(SQLITE_RANGE);
    DefInt(SQLITE_NOTADB);
    DefInt(SQLITE_NOTICE);
    DefInt(SQLITE_WARNING);
    DefInt(SQLITE_ROW);
    DefInt(SQLITE_DONE);

    // Extended Result Codes
    DefInt(SQLITE_ERROR_MISSING_COLLSEQ);
    DefInt(SQLITE_ERROR_RETRY);
    DefInt(SQLITE_ERROR_SNAPSHOT);
    DefInt(SQLITE_IOERR_READ);
    DefInt(SQLITE_IOERR_SHORT_READ);
    DefInt(SQLITE_IOERR_WRITE);
    DefInt(SQLITE_IOERR_FSYNC);
    DefInt(SQLITE_IOERR_DIR_FSYNC);
    DefInt(SQLITE_IOERR_TRUNCATE);
    DefInt(SQLITE_IOERR_FSTAT);
    DefInt(SQLITE_IOERR_UNLOCK);
    DefInt(SQLITE_IOERR_RDLOCK);
    DefInt(SQLITE_IOERR_DELETE);
    DefInt(SQLITE_IOERR_BLOCKED);
    DefInt(SQLITE_IOERR_NOMEM);
    DefInt(SQLITE_IOERR_ACCESS);
    DefInt(SQLITE_IOERR_CHECKRESERVEDLOCK);
    DefInt(SQLITE_IOERR_LOCK);
    DefInt(SQLITE_IOERR_CLOSE);
    DefInt(SQLITE_IOERR_DIR_CLOSE);
    DefInt(SQLITE_IOERR_SHMOPEN);
    DefInt(SQLITE_IOERR_SHMSIZE);
    DefInt(SQLITE_IOERR_SHMLOCK);
    DefInt(SQLITE_IOERR_SHMMAP);
    DefInt(SQLITE_IOERR_SEEK);
    DefInt(SQLITE_IOERR_DELETE_NOENT);
    DefInt(SQLITE_IOERR_MMAP);
    DefInt(SQLITE_IOERR_GETTEMPPATH);
    DefInt(SQLITE_IOERR_CONVPATH);
    DefInt(SQLITE_IOERR_VNODE);
    DefInt(SQLITE_IOERR_AUTH);
    DefInt(SQLITE_IOERR_BEGIN_ATOMIC);
    DefInt(SQLITE_IOERR_COMMIT_ATOMIC);
    DefInt(SQLITE_IOERR_ROLLBACK_ATOMIC);
    DefInt(SQLITE_IOERR_DATA);
    DefInt(SQLITE_IOERR_CORRUPTFS);
    DefInt(SQLITE_LOCKED_SHAREDCACHE);
    DefInt(SQLITE_LOCKED_VTAB);
    DefInt(SQLITE_BUSY_RECOVERY);
    DefInt(SQLITE_BUSY_SNAPSHOT);
    DefInt(SQLITE_BUSY_TIMEOUT);
    DefInt(SQLITE_CANTOPEN_NOTEMPDIR);
    DefInt(SQLITE_CANTOPEN_ISDIR);
    DefInt(SQLITE_CANTOPEN_FULLPATH);
    DefInt(SQLITE_CANTOPEN_CONVPATH);
    //DefInt(SQLITE_CANTOPEN_DIRTYWAL)/*docs say not used*/;
    DefInt(SQLITE_CANTOPEN_SYMLINK);
    DefInt(SQLITE_CORRUPT_VTAB);
    DefInt(SQLITE_CORRUPT_SEQUENCE);
    DefInt(SQLITE_CORRUPT_INDEX);
    DefInt(SQLITE_READONLY_RECOVERY);
    DefInt(SQLITE_READONLY_CANTLOCK);
    DefInt(SQLITE_READONLY_ROLLBACK);
    DefInt(SQLITE_READONLY_DBMOVED);
    DefInt(SQLITE_READONLY_CANTINIT);
    DefInt(SQLITE_READONLY_DIRECTORY);
    DefInt(SQLITE_ABORT_ROLLBACK);
    DefInt(SQLITE_CONSTRAINT_CHECK);
    DefInt(SQLITE_CONSTRAINT_COMMITHOOK);
    DefInt(SQLITE_CONSTRAINT_FOREIGNKEY);
    DefInt(SQLITE_CONSTRAINT_FUNCTION);
    DefInt(SQLITE_CONSTRAINT_NOTNULL);
    DefInt(SQLITE_CONSTRAINT_PRIMARYKEY);
    DefInt(SQLITE_CONSTRAINT_TRIGGER);
    DefInt(SQLITE_CONSTRAINT_UNIQUE);
    DefInt(SQLITE_CONSTRAINT_VTAB);
    DefInt(SQLITE_CONSTRAINT_ROWID);
    DefInt(SQLITE_CONSTRAINT_PINNED);
    DefInt(SQLITE_CONSTRAINT_DATATYPE);
    DefInt(SQLITE_NOTICE_RECOVER_WAL);
    DefInt(SQLITE_NOTICE_RECOVER_ROLLBACK);
    DefInt(SQLITE_WARNING_AUTOINDEX);
    DefInt(SQLITE_AUTH_USER);
    DefInt(SQLITE_OK_LOAD_PERMANENTLY);
    //DefInt(SQLITE_OK_SYMLINK) /* internal use only */;
  } _DefGroup;

  DefGroup(dataTypes) {
    DefInt(SQLITE_INTEGER);
    DefInt(SQLITE_FLOAT);
    DefInt(SQLITE_TEXT);
    DefInt(SQLITE_BLOB);
    DefInt(SQLITE_NULL);
  } _DefGroup;

  DefGroup(encodings) {
    /* Noting that the wasm binding only aims to support UTF-8. */
    DefInt(SQLITE_UTF8);
    DefInt(SQLITE_UTF16LE);
    DefInt(SQLITE_UTF16BE);
    DefInt(SQLITE_UTF16);
    /*deprecated DefInt(SQLITE_ANY); */
    DefInt(SQLITE_UTF16_ALIGNED);
  } _DefGroup;

  DefGroup(blobFinalizers) {
    /* SQLITE_STATIC/TRANSIENT need to be handled explicitly as
    ** integers to avoid casting-related warnings. */
    out("\"SQLITE_STATIC\":0, \"SQLITE_TRANSIENT\":-1");
  } _DefGroup;

  DefGroup(udfFlags) {
    DefInt(SQLITE_DETERMINISTIC);
    DefInt(SQLITE_DIRECTONLY);
    DefInt(SQLITE_INNOCUOUS);
  } _DefGroup;

  DefGroup(openFlags) {
    /* Noting that not all of these will have any effect in WASM-space. */
    DefInt(SQLITE_OPEN_READONLY);
    DefInt(SQLITE_OPEN_READWRITE);
    DefInt(SQLITE_OPEN_CREATE);
    DefInt(SQLITE_OPEN_URI);
    DefInt(SQLITE_OPEN_MEMORY);
    DefInt(SQLITE_OPEN_NOMUTEX);
    DefInt(SQLITE_OPEN_FULLMUTEX);
    DefInt(SQLITE_OPEN_SHAREDCACHE);
    DefInt(SQLITE_OPEN_PRIVATECACHE);
    DefInt(SQLITE_OPEN_EXRESCODE);
    DefInt(SQLITE_OPEN_NOFOLLOW);
    /* OPEN flags for use with VFSes... */
    DefInt(SQLITE_OPEN_MAIN_DB);
    DefInt(SQLITE_OPEN_MAIN_JOURNAL);
    DefInt(SQLITE_OPEN_TEMP_DB);
    DefInt(SQLITE_OPEN_TEMP_JOURNAL);
    DefInt(SQLITE_OPEN_TRANSIENT_DB);
    DefInt(SQLITE_OPEN_SUBJOURNAL);
    DefInt(SQLITE_OPEN_SUPER_JOURNAL);
    DefInt(SQLITE_OPEN_WAL);
    DefInt(SQLITE_OPEN_DELETEONCLOSE);
    DefInt(SQLITE_OPEN_EXCLUSIVE);
  } _DefGroup;

  DefGroup(syncFlags) {
    DefInt(SQLITE_SYNC_NORMAL);
    DefInt(SQLITE_SYNC_FULL);
    DefInt(SQLITE_SYNC_DATAONLY);
  } _DefGroup;

  DefGroup(prepareFlags) {
    DefInt(SQLITE_PREPARE_PERSISTENT);
    DefInt(SQLITE_PREPARE_NORMALIZE);
    DefInt(SQLITE_PREPARE_NO_VTAB);
  } _DefGroup;

  DefGroup(flock) {
    DefInt(SQLITE_LOCK_NONE);
    DefInt(SQLITE_LOCK_SHARED);
    DefInt(SQLITE_LOCK_RESERVED);
    DefInt(SQLITE_LOCK_PENDING);
    DefInt(SQLITE_LOCK_EXCLUSIVE);
  } _DefGroup;

  DefGroup(ioCap) {
    DefInt(SQLITE_IOCAP_ATOMIC);
    DefInt(SQLITE_IOCAP_ATOMIC512);
    DefInt(SQLITE_IOCAP_ATOMIC1K);
    DefInt(SQLITE_IOCAP_ATOMIC2K);
    DefInt(SQLITE_IOCAP_ATOMIC4K);
    DefInt(SQLITE_IOCAP_ATOMIC8K);
    DefInt(SQLITE_IOCAP_ATOMIC16K);
    DefInt(SQLITE_IOCAP_ATOMIC32K);
    DefInt(SQLITE_IOCAP_ATOMIC64K);
    DefInt(SQLITE_IOCAP_SAFE_APPEND);
    DefInt(SQLITE_IOCAP_SEQUENTIAL);
    DefInt(SQLITE_IOCAP_UNDELETABLE_WHEN_OPEN);
    DefInt(SQLITE_IOCAP_POWERSAFE_OVERWRITE);
    DefInt(SQLITE_IOCAP_IMMUTABLE);
    DefInt(SQLITE_IOCAP_BATCH_ATOMIC);
  } _DefGroup;

  DefGroup(access){
    DefInt(SQLITE_ACCESS_EXISTS);
    DefInt(SQLITE_ACCESS_READWRITE);
    DefInt(SQLITE_ACCESS_READ)/*docs say this is unused*/;
  } _DefGroup;
  
#undef DefGroup
#undef DefStr
#undef DefInt
#undef _DefGroup

  /*
  ** Emit an array of "StructBinder" struct descripions, which look
  ** like:
  **
  ** {
  **   "name": "MyStruct",
  **   "sizeof": 16,
  **   "members": {
  **     "member1": {"offset": 0,"sizeof": 4,"signature": "i"},
  **     "member2": {"offset": 4,"sizeof": 4,"signature": "p"},
  **     "member3": {"offset": 8,"sizeof": 8,"signature": "j"}
  **   }
  ** }
  **
  ** Detailed documentation for those bits are in the docs for the
  ** Jaccwabyt JS-side component.
  */

  /** Macros for emitting StructBinder description. */
#define StructBinder__(TYPE)                 \
  n = 0;                                     \
  outf("%s{", (structCount++ ? ", " : ""));  \
  out("\"name\": \"" # TYPE "\",");         \
  outf("\"sizeof\": %d", (int)sizeof(TYPE)); \
  out(",\"members\": {");
#define StructBinder_(T) StructBinder__(T)
  /** ^^^ indirection needed to expand CurrentStruct */
#define StructBinder StructBinder_(CurrentStruct)
#define _StructBinder CloseBrace(2)
#define M(MEMBER,SIG)                                         \
  outf("%s\"%s\": "                                           \
       "{\"offset\":%d,\"sizeof\": %d,\"signature\":\"%s\"}", \
       (n++ ? ", " : ""), #MEMBER,                            \
       (int)offsetof(CurrentStruct,MEMBER),                   \
       (int)sizeof(((CurrentStruct*)0)->MEMBER),              \
       SIG)

  structCount = 0;
  out(", \"structs\": ["); {

#define CurrentStruct sqlite3_vfs
    StructBinder {
      M(iVersion,"i");
      M(szOsFile,"i");
      M(mxPathname,"i");
      M(pNext,"p");
      M(zName,"s");
      M(pAppData,"p");
      M(xOpen,"i(pppip)");
      M(xDelete,"i(ppi)");
      M(xAccess,"i(ppip)");
      M(xFullPathname,"i(ppip)");
      M(xDlOpen,"p(pp)");
      M(xDlError,"p(pip)");
      M(xDlSym,"p()");
      M(xDlClose,"v(pp)");
      M(xRandomness,"i(pip)");
      M(xSleep,"i(pi)");
      M(xCurrentTime,"i(pp)");
      M(xGetLastError,"i(pip)");
      M(xCurrentTimeInt64,"i(pp)");
      M(xSetSystemCall,"i(ppp)");
      M(xGetSystemCall,"p(pp)");
      M(xNextSystemCall,"p(pp)");
    } _StructBinder;
#undef CurrentStruct

#define CurrentStruct sqlite3_io_methods
    StructBinder {
      M(iVersion,"i");
      M(xClose,"i(p)");
      M(xRead,"i(ppij)");
      M(xWrite,"i(ppij)");
      M(xTruncate,"i(pj)");
      M(xSync,"i(pi)");
      M(xFileSize,"i(pp)");
      M(xLock,"i(pi)");
      M(xUnlock,"i(pi)");
      M(xCheckReservedLock,"i(pp)");
      M(xFileControl,"i(pip)");
      M(xSectorSize,"i(p)");
      M(xDeviceCharacteristics,"i(p)");
      M(xShmMap,"i(piiip)");
      M(xShmLock,"i(piii)");
      M(xShmBarrier,"v(p)");
      M(xShmUnmap,"i(pi)");
      M(xFetch,"i(pjip)");
      M(xUnfetch,"i(pjp)");
    } _StructBinder;
#undef CurrentStruct

#define CurrentStruct sqlite3_file
    StructBinder {
      M(pMethods,"P");
    } _StructBinder;
#undef CurrentStruct

  } out( "]"/*structs*/);

  out("}"/*top-level object*/);
  *pos = 0;
  strBuf[0] = '{'/*end of the race-condition workaround*/;
  return strBuf;
#undef StructBinder
#undef StructBinder_
#undef StructBinder__
#undef M
#undef _StructBinder
#undef CloseBrace
#undef out
#undef outf
#undef lenCheck
}

/*
** This function is NOT part of the sqlite3 public API. It is strictly
** for use by the sqlite project's own JS/WASM bindings.
**
** This function invokes the xDelete method of the default VFS,
** passing on the given filename. If zName is NULL, no default VFS is
** found, or it has no xDelete method, SQLITE_MISUSE is returned, else
** the result of the xDelete() call is returned.
*/
int sqlite3_wasm_vfs_unlink(const char * zName){
  int rc = SQLITE_MISUSE /* ??? */;
  sqlite3_vfs * const pVfs = sqlite3_vfs_find(0);
  if( zName && pVfs && pVfs->xDelete ){
    rc = pVfs->xDelete(pVfs, zName, 1);
  }
  return rc;
}

#if defined(__EMSCRIPTEN__) && defined(SQLITE_WASM_OPFS)
#include <emscripten/wasmfs.h>
#include <emscripten/console.h>
/*
** This function is NOT part of the sqlite3 public API. It is strictly
** for use by the sqlite project's own JS/WASM bindings, specifically
** only when building with Emscripten's WASMFS support.
**
** This function should only be called if the JS side detects the
** existence of the Origin-Private FileSystem (OPFS) APIs in the
** client. The first time it is called, this function instantiates a
** WASMFS backend impl for OPFS. On success, subsequent calls are
** no-ops.
**
** This function may be passed a "mount point" name, which must have a
** leading "/" and is currently restricted to a single path component,
** e.g. "/foo" is legal but "/foo/" and "/foo/bar" are not. If it is
** NULL or empty, it defaults to "/persistent".
**
** Returns 0 on success, SQLITE_NOMEM if instantiation of the backend
** object fails, SQLITE_IOERR if mkdir() of the zMountPoint dir in
** the virtual FS fails. In builds compiled without SQLITE_WASM_OPFS
** defined, SQLITE_NOTFOUND is returned without side effects.
*/
int sqlite3_wasm_init_opfs(const char *zMountPoint){
  static backend_t pOpfs = 0;
  if( !zMountPoint || !*zMountPoint ) zMountPoint = "/persistent";
  if( !pOpfs ){
    pOpfs = wasmfs_create_opfs_backend();
    if( pOpfs ){
      emscripten_console_log("Created WASMFS OPFS backend.");
    }
  }
  /** It's not enough to instantiate the backend. We have to create a
      mountpoint in the VFS and attach the backend to it. */
  if( pOpfs && 0!=access(zMountPoint, F_OK) ){
    /* mkdir() simply hangs when called from fiddle app. Cause is
       not yet determined but the hypothesis is an init-order
       issue. */
    /* Note that this check and is not robust but it will
       hypothetically suffice for the transient wasm-based virtual
       filesystem we're currently running in. */
    const int rc = wasmfs_create_directory(zMountPoint, 0777, pOpfs);
    emscripten_console_logf("OPFS mkdir(%s) rc=%d", zMountPoint, rc);
    if(rc) return SQLITE_IOERR;
  }
  return pOpfs ? 0 : SQLITE_NOMEM;
}
#else
int sqlite3_wasm_init_opfs(void){
  return SQLITE_NOTFOUND;
}
#endif /* __EMSCRIPTEN__ && SQLITE_WASM_OPFS */

#if defined(__EMSCRIPTEN__) // && defined(SQLITE_OS_KV)
#include "emscripten.h"

#ifndef KVSTORAGE_KEY_SZ
/* We can remove this once kvvfs and this bit is merged. */
#  define KVSTORAGE_KEY_SZ 32
static void kvstorageMakeKey(
  const char *zClass,
  const char *zKeyIn,
  char *zKeyOut
){
  sqlite3_snprintf(KVSTORAGE_KEY_SZ, zKeyOut, "kvvfs-%s-%s", zClass, zKeyIn);
}
#endif

/*
** An internal level of indirection for accessing the static
** kvstorageMakeKey() from EM_JS()-generated functions. This must be
** made available for export via Emscripten but is not intended to be
** used from client code. If called with a NULL zKeyOut it is a no-op.
** It returns KVSTORAGE_KEY_SZ, so JS code (which cannot see that
** constant) may call it with NULL arguments to get the size of the
** allocation they'll need for a kvvfs key.
**
** Maintenance reminder: Emscripten will install this in the Module
** init scope and will prefix its name with "_".
*/
int sqlite3_wasm__kvvfsMakeKey(const char *zClass,
                                  const char *zKeyIn,
                                  char *zKeyOut){
  if(zKeyOut) kvstorageMakeKey(zClass, zKeyIn, zKeyOut);
  return KVSTORAGE_KEY_SZ;
}

#if 0
/*
** Alternately, we can implement kvstorageMakeKey() in JS in such a
** way that it's visible to kvstorageWrite/Delete/Read() but not the
** rest of the world. This impl is considerably more verbose than
** the C impl because writing directly to memory requires more code in
** JS.
*/
EM_JS(void, kvstorageMakeKeyJS,
      (const char *zClass, const char *zKeyIn, char *zKeyOut),{
  const max = 32;
  if(!arguments.length) return max;
  let n = 0, i = 0, ch = 0;
  // Write key prefix to dest...
  if(0){
    const prefix = "kvvfs-";
    for(i in prefix) setValue(zKeyOut+(n++), prefix.charCodeAt(i));
  }else{
    // slightly optimized but less readable...
    setValue(zKeyOut + (n++), 107/*'k'*/);
    setValue(zKeyOut + (n++), 118/*'v'*/);
    setValue(zKeyOut + (n++), 118/*'v'*/);
    setValue(zKeyOut + (n++), 102/*'f'*/);
    setValue(zKeyOut + (n++), 115/*'s'*/);
    setValue(zKeyOut + (n++),  45/*'-'*/);
  }
  // Write zClass to dest...
  for(i = 0; n < max && (ch = getValue(zClass+i)); ++n, ++i){
    setValue(zKeyOut + n, ch);
  }
  // Write "-" separator to dest...
  if(n<max) setValue(zKeyOut + (n++), 45/* == '-'*/);
  // Write zKeyIn to dest...
  for(i = 0; n < max && (ch = getValue(zKeyIn+i)); ++n, ++i){
    setValue(zKeyOut + n, ch);
  }
  // NUL terminate...
  if(n<max) setValue(zKeyOut + n, 0);
});
#endif

/*
** Internal helper for kvstorageWrite/Read/Delete() which creates a
** storage key for the given zClass/zKeyIn combination. Returns a
** pointer to the key: a C string allocated on the WASM stack, or 0 if
** allocation fails. It is up to the caller to save/restore the stack
** before/after this operation.
*/
EM_JS(const char *, kvstorageMakeKeyOnJSStack,
      (const char *zClass, const char *zKeyIn),{
  if( 0==zClass || 0==zKeyIn) return 0;
  const zXKey = stackAlloc(_sqlite3_wasm__kvvfsMakeKey(0,0,0));
  if(zXKey) _sqlite3_wasm__kvvfsMakeKey(zClass, zKeyIn, zXKey);
  return zXKey;
});

/*
** JS impl of kvstorageWrite(). Main docs are in the C impl. This impl
** writes zData to the global sessionStorage (if zClass starts with
** 's') or localStorage, using a storage key derived from zClass and
** zKey.
*/
EM_JS(int, kvstorageWrite,
      (const char *zClass, const char *zKey, const char *zData),{
  const stack = stackSave();
  try {
    const zXKey = kvstorageMakeKeyOnJSStack(zClass,zKey);
    if(!zXKey) return 1/*OOM*/;
    const jKey = UTF8ToString(zXKey);
    /**
       We could simplify this function and eliminate the
       kvstorageMakeKey() symbol acrobatics if we'd simply hard-code
       the key algo into the 3 functions which need it:

       const jKey = "kvvfs-"+UTF8ToString(zClass)+"-"+UTF8ToString(zKey);
    */
    ((115/*=='s'*/===getValue(zClass))
     ? sessionStorage : localStorage).setItem(jKey, UTF8ToString(zData));
  }catch(e){
    console.error("kvstorageWrite()",e);
    return 1; // Can't access SQLITE_xxx from here
  }finally{
    stackRestore(stack);
  }
  return 0;
});

/*
** JS impl of kvstorageDelete(). Main docs are in the C impl. This
** impl generates a key derived from zClass and zKey, and removes the
** matching entry (if any) from global sessionStorage (if zClass
** starts with 's') or localStorage.
*/
EM_JS(int, kvstorageDelete,
      (const char *zClass, const char *zKey),{
  const stack = stackSave();
  try {
    const zXKey = kvstorageMakeKeyOnJSStack(zClass,zKey);
    if(!zXKey) return 1/*OOM*/;
    _sqlite3_wasm__kvvfsMakeKey(zClass, zKey, zXKey);
    const jKey = UTF8ToString(zXKey);
    ((115/*=='s'*/===getValue(zClass))
     ? sessionStorage : localStorage).removeItem(jKey);
  }catch(e){
    console.error("kvstorageDelete()",e);
    return 1;
  }finally{
    stackRestore(stack);
  }
  return 0;
});

/*
** JS impl of kvstorageRead(). Main docs are in the C impl. This impl
** reads its data from the global sessionStorage (if zClass starts
** with 's') or localStorage, using a storage key derived from zClass
** and zKey.
*/
EM_JS(int, kvstorageRead,
      (const char *zClass, const char *zKey, char *zBuf, int nBuf),{
  const stack = stackSave();
  try {
    const zXKey = kvstorageMakeKeyOnJSStack(zClass,zKey);
    if(!zXKey) return 1/*OOM*/;
    const jKey = UTF8ToString(zXKey);
    const jV = ((115/*=='s'*/===getValue(zClass))
                ? sessionStorage : localStorage).getItem(jKey);
    if(!jV) return -1;
    const nV = jV.length /* Note that we are relying 100% on v being
                            ASCII so that jV.length is equal to the
                            C-string's byte length. */;
    if(nBuf<=0) return nV;
    else if(1===nBuf){
      setValue(zBuf, 0);
      return nV;
    }
    const zV = allocateUTF8OnStack(jV);
    if(nBuf > nV + 1) nBuf = nV + 1;
    HEAPU8.copyWithin(zBuf, zV, zV + nBuf - 1);
    setValue( zBuf + nBuf - 1, 0 );
    return nBuf - 1;
  }catch(e){
    console.error("kvstorageRead()",e);
    return -1;
  }finally{
    stackRestore(stack);
  }
});

/*
** This function exists for (1) WASM testing purposes and (2) as a
** hook to get Emscripten to export several EM_JS()-generated
** functions. It is not part of the public API and its signature
** and semantics may change at any time.
*/
int sqlite3_wasm__emjs_test(int whichOp){
  const char * zClass = "session";
  const char * zKey = "hello";
  int rc = 0;
  switch( whichOp ){
    case 1:
      kvstorageWrite(zClass, zKey, "world");
      break;
    case 2: {
      char buffer[128] = {0};
      char * zBuf = &buffer[0];
      rc = kvstorageRead(zClass, zKey, zBuf, (int)sizeof(buffer));
      printf("kvstorageRead()=%d %s\n", rc, zBuf);
      break;
    }
    case 3:
      kvstorageDelete(zClass, zKey);
      break;
  default:
    kvstorageMakeKeyOnJSStack(0,0) /* force Emscripten to include this */;
    break;
  }
  return rc;
}

#endif /* ifdef __EMSCRIPTEN__ */
