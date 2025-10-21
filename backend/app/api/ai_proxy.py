import httpx
from fastapi import APIRouter, Request, UploadFile, File, Response
from fastapi.responses import JSONResponse, StreamingResponse, RedirectResponse

AI_BASE = "http://127.0.0.1:5001"

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post("/camera/add")
async def proxy_add_camera(request: Request):
    body = await request.json()
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{AI_BASE}/api/camera/add", json=body, timeout=30.0)
    return JSONResponse(status_code=r.status_code, content=r.json())


@router.get("/camera/list")
async def proxy_list_cams():
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{AI_BASE}/api/camera/list", timeout=10.0)
    return JSONResponse(status_code=r.status_code, content=r.json())


@router.post("/camera/{cam_id}/set_task")
async def proxy_set_task(cam_id: str, request: Request):
    body = await request.json()
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{AI_BASE}/api/camera/{cam_id}/set_task", json=body, timeout=10.0)
    return JSONResponse(status_code=r.status_code, content=r.json())


@router.post("/camera/{cam_id}/clear_task")
async def proxy_clear_task(cam_id: str):
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{AI_BASE}/api/camera/{cam_id}/clear_task", timeout=10.0)
    return JSONResponse(status_code=r.status_code, content=r.json())


@router.delete("/camera/{cam_id}/remove")
async def proxy_remove_camera(cam_id: str):
    async with httpx.AsyncClient() as client:
        r = await client.delete(f"{AI_BASE}/api/camera/{cam_id}/remove", timeout=10.0)
    return JSONResponse(status_code=r.status_code, content=r.json())


@router.post("/upload")
async def proxy_upload(file: UploadFile = File(...)):
    # forward multipart upload
    files = {"file": (file.filename, await file.read(), file.content_type)}
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{AI_BASE}/api/upload", files=files, timeout=60.0)
    return JSONResponse(status_code=r.status_code, content=r.json())


@router.get("/camera/{cam_id}/stats")
async def proxy_camera_stats(cam_id: str):
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{AI_BASE}/api/camera/{cam_id}/stats", timeout=10.0)
    return JSONResponse(status_code=r.status_code, content=r.json())


@router.get("/preview")
async def proxy_preview(source: str):
    # Redirect browser to Flask preview stream
    return RedirectResponse(url=f"{AI_BASE}/preview?source={source}")


@router.get("/camera/{cam_id}/stream")
async def proxy_stream(cam_id: str):
    # Redirect to Flask stream endpoint
    return RedirectResponse(url=f"{AI_BASE}/camera/{cam_id}/stream")
