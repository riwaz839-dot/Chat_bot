from django.urls import path,include
from .views import Register,Logout,Google,Dash
from rest_framework.routers import DefaultRouter
from .views import FriendRequestViewSet, FriendShipmodelViewSet, ConversationViewSet, MessageViewSet,Search,UserDetail
router=DefaultRouter()
router.register(r"friend-requests", FriendRequestViewSet)
router.register(r"friendships", FriendShipmodelViewSet)
router.register(r"conversations", ConversationViewSet)
router.register(r"messages", MessageViewSet)
router.register(r"users", UserDetail, basename="user-detail")
urlpatterns =[
    path("register/",Register.as_view(),name="register"),
    path("logout/",Logout.as_view(),name="logout"),
    path("google/",Google.as_view(),name="google"),
    path("dashboard/",Dash.as_view(),name="dashboard"),
    path("", include(router.urls)),

    path("search/", Search.as_view(), name="search"),
]