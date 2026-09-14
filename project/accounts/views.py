from django.contrib.auth.models import User
from decouple import config

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from rest_framework.generics import RetrieveAPIView

from rest_framework_simplejwt.tokens import RefreshToken

from google.oauth2 import id_token
from google.auth.transport import requests

from .serializers import UserSerializer
from rest_framework.views import APIView


from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated


class Register(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = UserSerializer(data=request.data)

        if serializer.is_valid():
            user = serializer.save()

            refresh = RefreshToken.for_user(user)
            access = refresh.access_token

            return Response(
                {
                    "message": "Successfully registered!",
                    "refresh": str(refresh),
                    "access": str(access),
                },
                status=status.HTTP_201_CREATED,
            )

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class Logout(APIView):
    def post(self, request):
        try:
            token = request.data.get("refresh")

            refresh_token = RefreshToken(token)
            refresh_token.blacklist()

            return Response({"message": "Logged out successfully!"})

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class Google(APIView):
    permission_classes = [AllowAny]

    def post(self, request):

        token = request.data.get("id_token")

        if not token:
            return Response(
                {"error": "ID token is required"}, status=status.HTTP_400_BAD_REQUEST
            )

        try:
            data = id_token.verify_oauth2_token(
                token, requests.Request(), config("GOOGLE_CLIENT_ID")
            )

            email = data.get("email")

            username = email.split("@")[0]

            user, created = User.objects.get_or_create(
                email=email,
                defaults={
                    "username": username,
                    "first_name": data.get("given_name", ""),
                },
            )

            refresh = RefreshToken.for_user(user)
            access = refresh.access_token

            return Response(
                {
                    "message": "Google login successful!",
                    "refresh": str(refresh),
                    "access": str(access),
                }
            )

        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class Dash(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"message": f"Welcome {request.user.username}!"})


from .serializers import (
    FriendShipmodelSerializer,
    FriendRequestSerializer,
    ConversationSerializer,
    MessageSerializer,
)
from .models import FriendRequest, FriendShipmodel, Conversation, Message
from rest_framework import viewsets


class FriendRequestViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = FriendRequest.objects.all()
    serializer_class = FriendRequestSerializer

    def get_queryset(self):
        user = self.request.user
        return FriendRequest.objects.filter(receiver=user)

    def perform_create(self, serializer):
        serializer.save(sender=self.request.user)


class FriendShipmodelViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = FriendShipmodel.objects.all()
    serializer_class = FriendShipmodelSerializer

    def get_queryset(self):
        user = self.request.user
        return FriendShipmodel.objects.filter(
            user1=user
        ) | FriendShipmodel.objects.filter(user2=user)


class ConversationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Conversation.objects.all()
    serializer_class = ConversationSerializer

    def get_queryset(self):
        user = self.request.user
        return Conversation.objects.filter(participants=user)

    def perform_create(self, serializer):
        conversation = serializer.save()
        conversation.participants.add(self.request.user)


class MessageViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = Message.objects.all()
    serializer_class = MessageSerializer

    def get_queryset(self):
        user = self.request.user
        return Message.objects.filter(conversation__participants=user)

    def perform_create(self, serializer):
        serializer.save(sender=self.request.user)


from django.db.models import Q
from .serializers import SearchSerializer, UserSerializer


class Search(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = SearchSerializer(data=request.query_params)

        if serializer.is_valid():
            q = serializer.validated_data.get("q")
            results = User.objects.filter(
                Q(username__icontains=q) | Q(email__icontains=q)
            )
            result_serializer = UserSerializer(results, many=True)
            return Response({"results": result_serializer.data})

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST,)

    def post(self, request):
        serializer = SearchSerializer(data=request.data)
        if serializer.is_valid():
            q = serializer.validated_data.get("q")
            result = User.objects.filter(
                Q(username__icontains=q) | Q(email__icontains=q)
            )
            result_serializer = UserSerializer(result, many=True)
            return Response({"results": result_serializer.data})

        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


from .serializers import UserDetailSerializer


class UserDetail(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    queryset = User.objects.all()
    serializer_class = UserDetailSerializer
    