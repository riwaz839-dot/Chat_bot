from rest_framework import serializers
from django.contrib.auth.models import User
from .models import FriendRequest, FriendShipmodel, Conversation, Message
from rest_framework.relations import PrimaryKeyRelatedField

class UserSerializer(serializers.ModelSerializer):

    class Meta:
        model = User
        fields = ["id", "username", "email", "password"]

        read_only_fields = ["id"]
        write_only_fields = ["password"]
        

    def create(self, validated_data):

        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            password=validated_data["password"]
        )

        return user
    

class FriendRequestSerializer(serializers.ModelSerializer):
    
    sender=PrimaryKeyRelatedField(queryset=User.objects.all())
    receiver=PrimaryKeyRelatedField(queryset=User.objects.all())
    
    class Meta:
        model = FriendRequest
        fields = ["id", "sender", "receiver", "status", "sent_at"]
        read_only_fields = ["id", "sent_at"]


class FriendShipmodelSerializer(serializers.ModelSerializer):
    user1=PrimaryKeyRelatedField(queryset=User.objects.all())
    user2=PrimaryKeyRelatedField(queryset=User.objects.all())

    class Meta:
        model = FriendShipmodel
        fields = ["user1", "user2", "created_at"]
class ConversationSerializer(serializers.ModelSerializer):
    participants=PrimaryKeyRelatedField(queryset=User.objects.all(), many=True, allow_empty=True)

    class Meta:
        model = Conversation
        fields = ["id", "participants", "created_at"]
        read_only_fields = ["id", "created_at"]
class MessageSerializer(serializers.ModelSerializer):
    sender=PrimaryKeyRelatedField(queryset=User.objects.all())
    conversation=PrimaryKeyRelatedField(queryset=Conversation.objects.all())

    class Meta:
        model = Message
        fields = ["conversation", "sender", "content", "timestamp"]
        read_only_fields = ["timestamp"]
class SearchSerializer(serializers.Serializer):
    q = serializers.CharField(required=True, allow_blank=False)
class UserDetailSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email"]
        read_only_fields = ["id", "username", "email"]